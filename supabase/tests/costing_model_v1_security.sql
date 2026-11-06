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
do $$
declare
  business_a uuid; owner_a uuid; owner_b uuid; business_b uuid;
  q_legacy public.arpe_quotes; q_v1 public.arpe_quotes; q_b public.arpe_quotes; order_v1 public.arpe_orders;
  legacy_item_id uuid; v1_item_id uuid; b_item_id uuid; new_item_id uuid;
  header jsonb:='{"customer_name":"Costing history","customer_phone":"","deposit_type":"percentage","deposit_value":50,"status":"accepted","delivery_internal_cost":0,"delivery_customer_charge":0}';
  cost_v0 jsonb; cost_v1 jsonb; forged_config jsonb; official_config jsonb; edited_config jsonb;
  items jsonb; snapshot jsonb; stored_version integer; stored_cost numeric;
begin
  select f.business_a,f.owner_a,f.business_b,f.owner_b into business_a,owner_a,business_b,owner_b from costing_test_businesses f;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);

  -- Legacy business cannot forge a v1 model for a new cost.
  cost_v0:='{"ingredients_cost":100,"waste_percent":12,"labor_hours":1,"labor_hourly_rate":100,"indirect_percent":12,"markup_percent":60,"costing_model_version":0}';
  begin
    perform * from public.arpe_save_quote_bundle(null,header,jsonb_build_array(jsonb_build_object('product','Forged v1','quantity',1,'unit_label','unidad','unit_price',200,'cost',cost_v0||'{"costing_model_version":1}')));
    raise exception 'TEST_FAILED legacy business accepted forged v1';
  exception when raise_exception then if sqlerrm='TEST_FAILED legacy business accepted forged v1' then raise; end if; end;

  -- Save a real classic snapshot before activating v1.
  select * into q_legacy from public.arpe_save_quote_bundle(null,header,jsonb_build_array(jsonb_build_object('product','Legacy line','quantity',1,'unit_label','unidad','unit_price',200,'cost',cost_v0)));
  select id into legacy_item_id from public.arpe_quote_items where quote_id=q_legacy.id;
  if (select costing_model_version from public.arpe_quote_item_costs where quote_item_id=legacy_item_id)<>0 then raise exception 'Legacy line was not stored as v0'; end if;

  -- Direct UPDATE cannot activate an invalid estimated-equipment profile.
  begin
    update public.arpe_cost_settings set costing_config=jsonb_set(costing_config,'{electricity_equipment,0,power_kw}','0'::jsonb) where business_id=business_a;
    update public.arpe_cost_settings set costing_model_version=1 where business_id=business_a;
    raise exception 'TEST_FAILED direct invalid activation was accepted';
  exception when raise_exception then if sqlerrm='TEST_FAILED direct invalid activation was accepted' then raise; end if; end;
  if (select costing_model_version from public.arpe_cost_settings where business_id=business_a)<>0 then raise exception 'Failed activation changed the active model'; end if;

  -- A valid direct activation succeeds and is checked by the database trigger.
  update public.arpe_cost_settings set costing_model_version=1 where business_id=business_a;
  official_config:=(select costing_config from public.arpe_cost_settings where business_id=business_a);

  -- A v1 business cannot submit a classic model for a new line.
  begin
    perform * from public.arpe_save_quote_bundle(null,header,jsonb_build_array(jsonb_build_object('product','Forged legacy','quantity',1,'unit_label','unidad','unit_price',200,'cost',cost_v0)));
    raise exception 'TEST_FAILED v1 business accepted forged legacy';
  exception when raise_exception then if sqlerrm='TEST_FAILED v1 business accepted forged legacy' then raise; end if; end;

  forged_config:=jsonb_set(jsonb_set(official_config,'{electricity_rate_per_kwh}','999'::jsonb),'{electricity_equipment,0,power_kw}','99'::jsonb);
  cost_v1:=jsonb_build_object('ingredients_cost',100,'waste_percent',12,'labor_hours',1,'labor_hourly_rate',100,'indirect_percent',0,'markup_percent',60,'costing_model_version',1,'costing_config',forged_config,
    'utilities','[{"kind":"electricity","equipment_id":"oven-a","minutes":45}]'::jsonb,
    'costing_snapshot',jsonb_build_object('version',1,'config_snapshot',forged_config,'utilities','[{"kind":"electricity","equipment_id":"oven-a","minutes":45}]'::jsonb,'overhead_allocation_hours',1));
  items:=jsonb_build_array(jsonb_build_object('product','v1 line','quantity',1,'unit_label','unidad','unit_price',250,'cost',cost_v1));
  select * into q_v1 from public.arpe_save_quote_bundle(null,header,items);
  select qi.id,qc.costing_snapshot,qc.utilities_total into v1_item_id,snapshot,stored_cost from public.arpe_quote_items qi join public.arpe_quote_item_costs qc on qc.quote_item_id=qi.id where qi.quote_id=q_v1.id;
  if snapshot->'config_snapshot' is distinct from official_config then raise exception 'Forged client config reached the v1 snapshot'; end if;
  if stored_cost<>12.17 then raise exception 'Server did not use official equipment/tariff; expected 12.17, got %',stored_cost; end if;

  -- A historical v1 snapshot must survive settings changes and quote editing.
  update public.arpe_cost_settings set costing_config=jsonb_set(costing_config,'{electricity_rate_per_kwh}','20'::jsonb) where business_id=business_a;
  edited_config:=(select costing_config from public.arpe_cost_settings where business_id=business_a);
  items:=jsonb_build_array(jsonb_build_object('id',v1_item_id,'product','v1 line edited','quantity',1,'unit_label','unidad','unit_price',260,
    'cost',cost_v1||jsonb_build_object('costing_model_version',0,'costing_config',forged_config,'costing_snapshot',jsonb_build_object('version',1,'config_snapshot',forged_config,'utilities','[{"kind":"electricity","equipment_id":"oven-a","minutes":45}]'::jsonb,'overhead_allocation_hours',1))));
  select * into q_v1 from public.arpe_save_quote_bundle(q_v1.id,header,items);
  select qi.id,qc.costing_model_version,qc.costing_snapshot into v1_item_id,stored_version,snapshot from public.arpe_quote_items qi join public.arpe_quote_item_costs qc on qc.quote_item_id=qi.id where qi.quote_id=q_v1.id;
  if stored_version<>1 or snapshot->'config_snapshot' is distinct from official_config then raise exception 'Historical v1 quote did not preserve its original model/config snapshot'; end if;
  select * into q_v1 from public.arpe_save_quote_bundle(q_v1.id,header,jsonb_build_array(jsonb_build_object('id',v1_item_id,'product','v1 line cost omitted','quantity',1,'unit_label','unidad','unit_price',260,'cost',null)));
  select qi.id,qc.costing_model_version,qc.costing_snapshot into v1_item_id,stored_version,snapshot from public.arpe_quote_items qi join public.arpe_quote_item_costs qc on qc.quote_item_id=qi.id where qi.quote_id=q_v1.id;
  if stored_version<>1 or snapshot->'config_snapshot' is distinct from official_config then raise exception 'Omitted client cost erased the historical v1 snapshot'; end if;
  select * into order_v1 from public.arpe_convert_quote_to_order(q_v1.id);
  if (select oi.costing_snapshot from public.arpe_order_items oi where oi.order_id=order_v1.id and oi.source_quote_item_id=v1_item_id)->'config_snapshot' is distinct from official_config then raise exception 'Order conversion did not preserve v1 configuration snapshot'; end if;

  -- Historical classic lines remain classic after activation, even if the client forges v1.
  items:=jsonb_build_array(jsonb_build_object('id',legacy_item_id,'product','Legacy line edited','quantity',1,'unit_label','unidad','unit_price',210,'cost',cost_v1));
  select * into q_legacy from public.arpe_save_quote_bundle(q_legacy.id,header,items);
  select qi.id,qc.costing_model_version,qc.costing_snapshot into legacy_item_id,stored_version,snapshot from public.arpe_quote_items qi join public.arpe_quote_item_costs qc on qc.quote_item_id=qi.id where qi.quote_id=q_legacy.id;
  if stored_version<>0 or snapshot is not null then raise exception 'Editing a legacy quote silently upgraded its cost'; end if;
  select * into q_legacy from public.arpe_save_quote_bundle(q_legacy.id,header,jsonb_build_array(jsonb_build_object('id',legacy_item_id,'product','Legacy line cost omitted','quantity',1,'unit_label','unidad','unit_price',210,'cost',null)));
  if (select count(*) from public.arpe_quote_item_costs qc join public.arpe_quote_items qi on qi.id=qc.quote_item_id where qi.quote_id=q_legacy.id and qc.costing_model_version=0)<>1 then raise exception 'Omitted client cost erased the historical legacy cost'; end if;

  -- Positive water use without an official tariff is rejected server-side.
  begin
    perform * from public.arpe_save_quote_bundle(null,header,jsonb_build_array(jsonb_build_object('product','Water without tariff','quantity',1,'unit_label','unidad','unit_price',200,'cost',cost_v1||jsonb_build_object('utilities','[{"kind":"water","liters":1}]'::jsonb))));
    raise exception 'TEST_FAILED water usage without tariff was accepted';
  exception when raise_exception then if sqlerrm='TEST_FAILED water usage without tariff was accepted' then raise; end if; end;

  -- Measured profiles may use a per-calculation reading, which must be positive when used.
  update public.arpe_cost_settings set costing_config=jsonb_set(costing_config,'{electricity_equipment,0,calculation_mode}','"measured"'::jsonb) where business_id=business_a;
  begin
    perform * from public.arpe_save_quote_bundle(null,header,jsonb_build_array(jsonb_build_object('product','Missing measurement','quantity',1,'unit_label','unidad','unit_price',200,'cost',cost_v1||jsonb_build_object('utilities','[{"kind":"electricity","equipment_id":"oven-a","minutes":45}]'::jsonb))));
    raise exception 'TEST_FAILED missing measured kWh was accepted';
  exception when raise_exception then if sqlerrm='TEST_FAILED missing measured kWh was accepted' then raise; end if; end;
  select * into q_v1 from public.arpe_save_quote_bundle(null,header,jsonb_build_array(jsonb_build_object('product','Measured usage','quantity',1,'unit_label','unidad','unit_price',200,'cost',cost_v1||jsonb_build_object('utilities','[{"kind":"electricity","equipment_id":"oven-a","minutes":45,"measured_kwh":0.9}]'::jsonb))));
  if (select qc.utilities_total from public.arpe_quote_items qi join public.arpe_quote_item_costs qc on qc.quote_item_id=qi.id where qi.quote_id=q_v1.id)<>18 then raise exception 'Per-calculation measured electricity was not calculated from official tariff'; end if;

  -- The public RPC remains tenant-scoped, and item IDs cannot cross quote/tenant boundaries.
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  select * into q_b from public.arpe_save_quote_bundle(null,header,jsonb_build_array(jsonb_build_object('product','Tenant B line','quantity',1,'unit_label','unidad','unit_price',100)));
  select id into b_item_id from public.arpe_quote_items where quote_id=q_b.id;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  begin
    perform * from public.arpe_save_quote_bundle(q_b.id,header,jsonb_build_array(jsonb_build_object('id',b_item_id,'product','Cross tenant','quantity',1,'unit_label','unidad','unit_price',100)));
    raise exception 'TEST_FAILED cross-tenant quote was editable';
  exception when raise_exception then if sqlerrm='TEST_FAILED cross-tenant quote was editable' then raise; end if; end;
  begin
    perform * from public.arpe_save_quote_bundle(q_legacy.id,header,jsonb_build_array(jsonb_build_object('id',b_item_id,'product','Cross tenant item','quantity',1,'unit_label','unidad','unit_price',100)));
    raise exception 'TEST_FAILED foreign item id was accepted';
  exception when raise_exception then if sqlerrm='TEST_FAILED foreign item id was accepted' then raise; end if; end;

  -- Authenticated clients must use the guarded RPC instead of direct cost-table writes.
  begin
    insert into public.arpe_quote_item_costs(quote_item_id,business_id,ingredients_cost,waste_percent,labor_hours,labor_hourly_rate,indirect_percent,markup_percent)
    values(v1_item_id,business_a,1,0,0,0,0,0);
    raise exception 'TEST_FAILED direct quote cost insert was permitted';
  exception when insufficient_privilege then null; end;
end $$;
select 'PASS: tenant configuration isolation and server-side costing config validation' as result;
rollback;
