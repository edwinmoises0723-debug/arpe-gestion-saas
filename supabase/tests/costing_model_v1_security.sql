-- Local/Supabase SQL-editor test. Requires two dedicated auth users without businesses.
begin;
create temporary table costing_test_businesses(owner_a uuid, owner_b uuid, business_a uuid, business_b uuid);
insert into costing_test_businesses(owner_a,owner_b)
select a.id,b.id from auth.users a cross join auth.users b
where a.id<>b.id
  and not exists(select 1 from public.arpe_businesses x where x.owner_id=a.id)
  and not exists(select 1 from public.arpe_businesses x where x.owner_id=b.id)
limit 1;
do $$ begin if not exists(select 1 from costing_test_businesses) then raise exception 'Need two dedicated auth users without businesses'; end if; end $$;
grant select,update on costing_test_businesses to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select owner_a::text from costing_test_businesses),true);
insert into public.arpe_businesses(owner_id,name) select owner_a,'Costing A' from costing_test_businesses;
select set_config('request.jwt.claim.sub',(select owner_b::text from costing_test_businesses),true);
insert into public.arpe_businesses(owner_id,name) select owner_b,'Costing B' from costing_test_businesses;
reset role;
update costing_test_businesses f set business_a=a.id,business_b=b.id from public.arpe_businesses a,public.arpe_businesses b
where a.owner_id=f.owner_a and b.owner_id=f.owner_b;
-- Remove B's generated settings row so the insert check reaches RLS instead of
-- stopping at the business_id unique constraint.
delete from public.arpe_cost_settings where business_id=(select business_b from costing_test_businesses);
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_a::text from costing_test_businesses),true);
do $$ begin
  begin
    insert into public.arpe_cost_settings(business_id) select business_b from costing_test_businesses;
    raise exception 'Cross-tenant configuration insert was permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.arpe_cost_settings(business_id) select business_b from costing_test_businesses;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select owner_b::text from costing_test_businesses),true);
do $$ begin
  if exists(select 1 from public.arpe_cost_settings where business_id=(select business_a from costing_test_businesses)) then raise exception 'Business B can read business A costing configuration'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select owner_a::text from costing_test_businesses),true);
update public.arpe_cost_settings set costing_config=
  jsonb_set(jsonb_set(jsonb_set(jsonb_set(costing_config,'{electricity_rate_per_kwh}','10.82'::jsonb),'{electricity_equipment}','[{"id":"oven-a","name":"Horno A","active":true,"power_kw":1.5,"calculation_mode":"estimated"}]'::jsonb),'{productive_hours_per_month}','250'::jsonb),'{overhead_items}','[{"name":"Renta","category":"General","monthly_cost":100,"active":true}]'::jsonb)
  where business_id=(select business_a from costing_test_businesses);
do $$ declare affected integer; begin
  if (select count(*) from public.arpe_cost_settings where business_id in (select business_a from costing_test_businesses union select business_b from costing_test_businesses))<>1 then raise exception 'Business A must only see its own settings/configuration'; end if;
  if (select jsonb_array_length(costing_config->'electricity_equipment') from public.arpe_cost_settings where business_id=(select business_a from costing_test_businesses))<>1 then raise exception 'Business A must see its own equipment profile'; end if;
  if (select jsonb_array_length(costing_config->'overhead_items') from public.arpe_cost_settings where business_id=(select business_a from costing_test_businesses))<>1 then raise exception 'Business A must see its own overhead items'; end if;
  update public.arpe_cost_settings set costing_config=jsonb_set(costing_config,'{water_rate_per_liter}','9'::jsonb) where business_id=(select business_b from costing_test_businesses);
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Cross-tenant configuration update was permitted'; end if;
  begin
    delete from public.arpe_cost_settings where business_id=(select business_b from costing_test_businesses);
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'Cross-tenant configuration delete was permitted'; end if;
  exception when insufficient_privilege then null; end;
  begin
    update public.arpe_cost_settings set costing_config=jsonb_set(costing_config,'{electricity_rate_per_kwh}','-1'::jsonb) where business_id=(select business_a from costing_test_businesses);
    raise exception 'Negative electricity tariff was accepted';
  exception when raise_exception then if sqlerrm='Negative electricity tariff was accepted' then raise; end if; end;
  begin
    update public.arpe_cost_settings set costing_config=jsonb_set(jsonb_set(costing_config,'{productive_hours_per_month}','0'::jsonb),'{overhead_items}','[{"name":"Renta","category":"Renta","monthly_cost":100,"active":true}]'::jsonb) where business_id=(select business_a from costing_test_businesses);
    raise exception 'Overhead without productive hours was accepted';
  exception when raise_exception then if sqlerrm='Overhead without productive hours was accepted' then raise; end if; end;
end $$;
select 'PASS: tenant configuration isolation and server-side costing config validation' as result;
rollback;
