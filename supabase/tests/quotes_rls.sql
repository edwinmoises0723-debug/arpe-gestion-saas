-- Safe smoke test: uses the existing owner's business inside a transaction and rolls back.
begin;
do $$ begin
  if not exists (select 1 from public.arpe_businesses) then
    raise exception 'A Fase 1 business is required for this smoke test';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from public.arpe_businesses limit 1), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
insert into public.arpe_quotes (business_id, customer_name, product, total_amount, deposit_type, deposit_value)
select id, 'ARPE smoke test', 'Pastel de prueba', 1000, 'percentage', 50 from public.arpe_businesses limit 1;
do $$ declare saved public.arpe_quotes; begin
  select * into saved from public.arpe_quotes where customer_name = 'ARPE smoke test';
  if saved.quote_number !~ '^ARPE-COT-[0-9]{4}-[0-9]{4}$' then raise exception 'Invalid generated quote number'; end if;
  if saved.deposit_required <> 500 then raise exception 'Invalid deposit amount'; end if;
end $$;
rollback;
select 'PASS: quote insert, safe number format, deposit persistence and rollback' as result;
