-- Run in Supabase SQL Editor as postgres. All fixture data is rolled back.
-- Requires at least one existing auth user. Never modifies existing business rows.
begin;
create temporary table arpe_test_fixture as
select id as owner_id from auth.users
where id not in (select owner_id from public.arpe_businesses)
limit 1;
do $$ begin
  if not exists (select 1 from arpe_test_fixture) then
    raise exception 'Create a dedicated test Auth user without a Phase 1 business before running this test';
  end if;
end $$;
grant select on arpe_test_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from arpe_test_fixture), true);
insert into public.arpe_businesses (owner_id, name) select owner_id, 'ARPE transaction test' from arpe_test_fixture;
do $$ declare affected integer; begin
  if (select count(*) from public.arpe_businesses) <> 1 then raise exception 'Owner read failed'; end if;
  update public.arpe_businesses set currency = 'CRC' where name = 'ARPE transaction test';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner update failed'; end if;
  begin
    update public.arpe_businesses set owner_id = '99999999-9999-4999-8999-999999999999';
    raise exception 'Owner transfer was permitted';
  exception when insufficient_privilege then null; end;
  begin
    update public.arpe_businesses set currency = 'INVALID';
    raise exception 'Invalid currency was permitted';
  exception when check_violation then null; end;
  begin
    update public.arpe_businesses set logo_path = '99999999-9999-4999-8999-999999999999/logo.png';
    raise exception 'Foreign logo path was permitted';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
do $$ declare affected integer; begin
  if (select count(*) from public.arpe_businesses) <> 0 then raise exception 'Cross-user read was permitted'; end if;
  update public.arpe_businesses set name = 'Not allowed';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user update was permitted'; end if;
  begin
    insert into public.arpe_businesses (owner_id, name) select owner_id, 'Not allowed' from arpe_test_fixture;
    raise exception 'Forged owner insert was permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.arpe_businesses;
    raise exception 'Anonymous read was permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: owner read/write, tenant isolation, immutable ownership, currency, logo path, anonymous denial; fixtures rolled back' as result;
