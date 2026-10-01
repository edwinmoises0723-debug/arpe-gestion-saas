-- LOCAL ONLY. Run after all migrations in a disposable local Supabase database.
-- Every fixture is rolled back; no dependency on real clients or existing orders.
begin;
insert into auth.users(id) values ('aaaaaaaa-1111-4111-8111-111111111111'),('bbbbbbbb-2222-4222-8222-222222222222');
insert into public.arpe_businesses(id,owner_id,name) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-111111111111','Local test A'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-2222-4222-8222-222222222222','Local test B');
select set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$
declare p public.arpe_catalog_products; q public.arpe_quotes; o public.arpe_orders; again public.arpe_orders;
  header jsonb := '{"customer_name":"Local fixture","customer_phone":"","deposit_type":"percentage","deposit_value":50,"status":"accepted","delivery_internal_cost":100,"delivery_customer_charge":150}';
  items jsonb; first_cost jsonb := '{"ingredients_cost":700,"waste_percent":12,"labor_hours":3,"labor_hourly_rate":100,"indirect_percent":12,"markup_percent":60}';
  n integer; bad jsonb;
begin
  insert into public.arpe_catalog_products(business_id,name,category,default_unit_price)
    values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Local catalog','Pasteles',2000) returning * into p;
  items:=jsonb_build_array(
    jsonb_build_object('catalog_product_id',p.id,'product',p.name,'quantity',1,'unit_label','pastel','unit_price',2000,'cost',first_cost,'direct_costs','[{"category":"packaging","name":"Caja","cost":150}]'::jsonb),
    jsonb_build_object('product','Local second','quantity',1,'unit_label','unidad','unit_price',850,'cost',first_cost),
    jsonb_build_object('product','Local third','quantity',24,'unit_label','unidad','unit_price',35,'cost',first_cost));
  select * into q from public.arpe_save_quote_bundle(null,header,items);
  if q.total_amount<>3840 or q.deposit_required<>1920 then raise exception 'Total or deposit mismatch'; end if;
  if (select count(*) from public.arpe_quote_items where quote_id=q.id)<>3 then raise exception 'Missing quote items'; end if;
  if (select sum(line_total) from public.arpe_quote_items where quote_id=q.id)<>3690 then raise exception 'Line arithmetic failed'; end if;
  if not exists(select 1 from public.arpe_quote_item_costs c join public.arpe_quote_items i on i.id=c.quote_item_id where i.quote_id=q.id and i.position=1 and c.waste_amount=84 and c.labor_cost=300 and c.production_subtotal=1234 and c.indirect_amount=148.08 and c.total_internal_cost=1382.08 and c.suggested_line_price=2211.33) then raise exception 'Item costing mismatch'; end if;
  update public.arpe_catalog_products set name='Changed catalog',default_unit_price=999,is_active=false where id=p.id;
  if not exists(select 1 from public.arpe_quote_items where quote_id=q.id and product='Local catalog' and unit_price=2000) then raise exception 'Catalog changed snapshot'; end if;

  -- A failure in a later cost item must undo header and earlier item changes.
  bad:=jsonb_set(items,'{2,cost,ingredients_cost}','-1');
  begin
    perform * from public.arpe_save_quote_bundle(q.id,header||'{"customer_name":"Should rollback"}',bad);
    raise exception 'TEST_FAILED invalid cost accepted';
  exception when check_violation then null; end;
  if (select customer_name from public.arpe_quotes where id=q.id)<>'Local fixture' or (select count(*) from public.arpe_quote_items where quote_id=q.id)<>3 then raise exception 'Bundle was partially saved'; end if;
  begin
    perform * from public.arpe_save_quote_bundle(q.id,header,'[]'); raise exception 'TEST_FAILED empty bundle';
  exception when raise_exception then if sqlerrm='TEST_FAILED empty bundle' then raise; end if; end;
  select * into q from public.arpe_save_quote_bundle(q.id,header||'{"deposit_type":"fixed","deposit_value":500}',items);
  if q.deposit_required<>500 then raise exception 'Fixed deposit mismatch'; end if;
  select * into o from public.arpe_convert_quote_to_order(q.id);
  select * into again from public.arpe_convert_quote_to_order(q.id);
  if again.id<>o.id or (select count(*) from public.arpe_orders where quote_id=q.id)<>1 or (select count(*) from public.arpe_order_items where order_id=o.id)<>3 then raise exception 'Conversion/idempotence failed'; end if;
  if o.total_amount<>3840 or o.deposit_required<>500 or o.delivery_customer_charge<>150 or o.delivery_internal_cost<>100 then raise exception 'Order snapshot mismatch'; end if;
  if o.internal_cost_total<>(select sum(internal_cost_total) from public.arpe_order_items where order_id=o.id)+100 or o.estimated_profit<>3840-o.internal_cost_total then raise exception 'Order costs mismatch'; end if;
  begin
    perform * from public.arpe_save_quote_bundle(q.id,header,items); raise exception 'TEST_FAILED converted quote editable';
  exception when raise_exception then if sqlerrm<>'Esta cotización ya generó un pedido.' then raise; end if; end;
  begin
    update public.arpe_quote_items set product='Unauthorized' where quote_id=q.id; raise exception 'TEST_FAILED item write allowed';
  exception when insufficient_privilege then null; end;

  -- Another authenticated tenant cannot see or mutate any of A's snapshots.
  perform set_config('request.jwt.claim.sub','bbbbbbbb-2222-4222-8222-222222222222',true);
  select count(*) into n from public.arpe_quote_items where quote_id=q.id;
  if n<>0 or exists(select 1 from public.arpe_order_items where order_id=o.id) or exists(select 1 from public.arpe_catalog_products where id=p.id) or exists(select 1 from public.arpe_quote_item_costs) or exists(select 1 from public.arpe_quote_item_cost_items) then raise exception 'Tenant isolation failed'; end if;
  update public.arpe_catalog_products set name='Forbidden' where id=p.id;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Cross-tenant catalog update'; end if;
  begin
    perform * from public.arpe_save_quote_bundle(q.id,header,items); raise exception 'TEST_FAILED cross-tenant save';
  exception when raise_exception then if sqlerrm<>'Quote not found or access denied' then raise; end if; end;
  begin
    perform * from public.arpe_convert_quote_to_order(q.id); raise exception 'TEST_FAILED cross-tenant convert';
  exception when raise_exception then if sqlerrm<>'Quote not found or access denied' then raise; end if; end;
  begin
    perform * from public.arpe_save_quote_bundle(null,header,items); raise exception 'TEST_FAILED foreign catalog reference';
  exception when foreign_key_violation then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform * from public.arpe_save_quote_bundle(null,header,items); raise exception 'TEST_FAILED anonymous save';
  exception when raise_exception then if sqlerrm<>'Authentication required' then raise; end if; end;
end $$;
reset role;
select 'PASS: atomic bundle, arithmetic, costs, snapshots, conversion, idempotence and tenant isolation' as result;
rollback;
