-- EJNEXA Costing Model v1. Additive columns preserve every legacy quote snapshot.
alter table public.arpe_cost_settings
  add column costing_model_version smallint not null default 1 check (costing_model_version = 1),
  add column costing_config jsonb not null default '{"electricity_rate_per_kwh":0,"natural_gas_rate_per_therm":0,"lpg_cylinder_price":0,"lpg_net_kg":0,"water_rate_per_liter":0,"monthly_overhead_total":0,"productive_hours_per_month":0,"overhead_items":[],"electricity_equipment":[],"natural_gas_equipment":[],"lpg_equipment":[]}'::jsonb;
alter table public.arpe_cost_settings add constraint arpe_cost_settings_config_object check (jsonb_typeof(costing_config)='object');

create or replace function private.validate_arpe_cost_settings() returns trigger
language plpgsql set search_path='' as $$
declare cfg jsonb:=new.costing_config; k text; row jsonb; overhead numeric:=0; hours numeric;
begin
  foreach k in array array['electricity_rate_per_kwh','natural_gas_rate_per_therm','lpg_cylinder_price','lpg_net_kg','water_rate_per_liter','productive_hours_per_month'] loop
    if jsonb_typeof(cfg->k) is distinct from 'number' or coalesce((cfg->>k)::numeric,0)<0 then raise exception 'Invalid nonnegative cost setting: %',k; end if;
  end loop;
  foreach k in array array['overhead_items','electricity_equipment','natural_gas_equipment','lpg_equipment'] loop
    if jsonb_typeof(cfg->k) is distinct from 'array' then raise exception 'Cost configuration % must be an array',k; end if;
  end loop;
  for row in select value from jsonb_array_elements(cfg->'overhead_items') loop
    if jsonb_typeof(row->'active') is distinct from 'boolean' or jsonb_typeof(row->'monthly_cost') is distinct from 'number' or (row->>'monthly_cost')::numeric<0 or length(btrim(coalesce(row->>'name','')))=0 then raise exception 'Invalid overhead item'; end if;
    if (row->>'active')::boolean then overhead:=overhead+(row->>'monthly_cost')::numeric; end if;
  end loop;
  hours:=coalesce((cfg->>'productive_hours_per_month')::numeric,0);
  if overhead>0 and hours<=0 then raise exception 'Productive hours must be greater than zero when overhead is configured'; end if;
  for row in select value from jsonb_array_elements(cfg->'electricity_equipment') loop
    if length(btrim(coalesce(row->>'name','')))=0 or jsonb_typeof(row->'active') is distinct from 'boolean' or jsonb_typeof(row->'power_kw') is distinct from 'number' or (row->>'power_kw')::numeric<0 or coalesce(row->>'calculation_mode','') not in ('estimated','measured') then raise exception 'Invalid electricity equipment'; end if;
    if row->>'calculation_mode'='measured' and coalesce((row->>'measured_kwh_per_cycle')::numeric,0)<0 then raise exception 'Invalid measured kWh'; end if;
  end loop;
  for row in select value from jsonb_array_elements(cfg->'natural_gas_equipment') loop
    if length(btrim(coalesce(row->>'name','')))=0 or jsonb_typeof(row->'active') is distinct from 'boolean' or jsonb_typeof(row->'btu_per_hour') is distinct from 'number' or (row->>'btu_per_hour')::numeric<0 then raise exception 'Invalid natural gas equipment'; end if;
  end loop;
  for row in select value from jsonb_array_elements(cfg->'lpg_equipment') loop
    if length(btrim(coalesce(row->>'name','')))=0 or jsonb_typeof(row->'active') is distinct from 'boolean' or jsonb_typeof(row->'consumption_kg_per_hour') is distinct from 'number' or (row->>'consumption_kg_per_hour')::numeric<0 then raise exception 'Invalid LPG equipment'; end if;
  end loop;
  new.costing_config:=jsonb_set(cfg,'{monthly_overhead_total}',to_jsonb(overhead),true);
  return new;
end $$;
revoke all on function private.validate_arpe_cost_settings() from public,anon,authenticated;
create trigger validate_arpe_cost_settings before insert or update of costing_config on public.arpe_cost_settings for each row execute function private.validate_arpe_cost_settings();

alter table public.arpe_quote_item_costs
  add column costing_model_version smallint not null default 0 check (costing_model_version in (0,1)),
  add column costing_snapshot jsonb,
  add column utilities_total numeric(12,2) not null default 0 check (utilities_total >= 0),
  add column overhead_amount numeric(12,2) not null default 0 check (overhead_amount >= 0);
alter table public.arpe_order_items
  add column costing_model_version smallint,
  add column costing_snapshot jsonb;

-- The saved business settings row is already tenant-scoped by owner RLS. Keep
-- all new reusable profiles there to avoid parallel, redundant configuration tables.
create or replace function private.calculate_arpe_item_cost() returns trigger
language plpgsql set search_path='' as $$
declare
  d numeric; cfg jsonb; u jsonb; e jsonb; k text; h numeric; used numeric; rate numeric;
  utilities numeric:=0; overhead_monthly numeric:=0; productive_hours numeric:=0; allocation_hours numeric:=0;
begin
  select coalesce(sum(cost),0) into d from public.arpe_quote_item_cost_items where quote_item_id=new.quote_item_id;
  new.waste_amount:=round(new.ingredients_cost*new.waste_percent/100,2);
  new.labor_cost:=round(new.labor_hours*new.labor_hourly_rate,2);
  if new.costing_model_version=1 then
    cfg:=coalesce(new.costing_snapshot->'config_snapshot',new.costing_snapshot->'costing_config');
    if cfg is null or jsonb_typeof(cfg) is distinct from 'object' then select costing_config into cfg from public.arpe_cost_settings where business_id=new.business_id; end if;
    if cfg is null then raise exception 'Cost configuration is missing'; end if;
    foreach k in array array['electricity_rate_per_kwh','natural_gas_rate_per_therm','lpg_cylinder_price','lpg_net_kg','water_rate_per_liter','monthly_overhead_total','productive_hours_per_month'] loop
      if jsonb_typeof(cfg->k) is distinct from 'number' or coalesce((cfg->>k)::numeric,0)<0 then raise exception 'Invalid cost configuration value: %',k; end if;
    end loop;
    foreach k in array array['overhead_items','electricity_equipment','natural_gas_equipment','lpg_equipment'] loop
      if jsonb_typeof(cfg->k) is distinct from 'array' then raise exception 'Invalid cost configuration list: %',k; end if;
    end loop;
    if jsonb_typeof(coalesce(new.costing_snapshot->'utilities','[]'::jsonb)) <> 'array' then raise exception 'Utilities must be an array'; end if;
    for u in select value from jsonb_array_elements(coalesce(new.costing_snapshot->'utilities','[]'::jsonb)) loop
      k:=u->>'kind';
      if coalesce(nullif(u->>'minutes','')::numeric,0)<0 or coalesce(nullif(u->>'hours','')::numeric,0)<0 then raise exception 'Utility duration cannot be negative'; end if;
      h:=coalesce(nullif(u->>'minutes','')::numeric/60,nullif(u->>'hours','')::numeric,0);
      if k='water' then
        if coalesce((u->>'liters')::numeric,0)<0 then raise exception 'Water liters cannot be negative'; end if;
        used:=coalesce((u->>'liters')::numeric,0); rate:=coalesce((cfg->>'water_rate_per_liter')::numeric,0);
        utilities:=utilities+used*rate;
      elsif k='electricity' then
        select value into e from jsonb_array_elements(coalesce(cfg->'electricity_equipment','[]'::jsonb)) where value->>'id'=u->>'equipment_id' and coalesce((value->>'active')::boolean,false);
        if e is null then raise exception 'Selected electrical equipment is not configured or active'; end if;
        rate:=coalesce((cfg->>'electricity_rate_per_kwh')::numeric,0);
        if e->>'calculation_mode'='measured' then used:=coalesce(nullif(u->>'measured_kwh','')::numeric,nullif(e->>'measured_kwh_per_cycle','')::numeric,0); if used<0 then raise exception 'Measured kWh cannot be negative'; end if;
        else if h>0 and coalesce((e->>'power_kw')::numeric,0)<=0 then raise exception 'Configure electrical power before costing usage'; end if; used:=coalesce((e->>'power_kw')::numeric,0)*h; end if;
        if used>0 and rate<=0 then raise exception 'Configure electricity tariff before costing usage'; end if;
        utilities:=utilities+used*rate;
      elsif k='natural_gas' then
        select value into e from jsonb_array_elements(coalesce(cfg->'natural_gas_equipment','[]'::jsonb)) where value->>'id'=u->>'equipment_id' and coalesce((value->>'active')::boolean,false);
        if e is null then raise exception 'Selected natural gas equipment is not configured or active'; end if;
        if h>0 and coalesce((e->>'btu_per_hour')::numeric,0)<=0 then raise exception 'Configure BTU per hour before costing usage'; end if;
        used:=coalesce((e->>'btu_per_hour')::numeric,0)*h/100000;
        rate:=coalesce((cfg->>'natural_gas_rate_per_therm')::numeric,0); if used>0 and rate<=0 then raise exception 'Configure natural gas tariff before costing usage'; end if;
        utilities:=utilities+used*rate;
      elsif k='lpg' then
        select value into e from jsonb_array_elements(coalesce(cfg->'lpg_equipment','[]'::jsonb)) where value->>'id'=u->>'equipment_id' and coalesce((value->>'active')::boolean,false);
        if e is null then raise exception 'Selected LPG equipment is not configured or active'; end if;
        rate:=coalesce((cfg->>'lpg_cylinder_price')::numeric,0); productive_hours:=coalesce((cfg->>'lpg_net_kg')::numeric,0);
        used:=coalesce((e->>'consumption_kg_per_hour')::numeric,0)*h;
        if used>0 and productive_hours<=0 then raise exception 'Configure net cylinder kilograms to calculate LPG'; end if;
        if h>0 and coalesce((e->>'consumption_kg_per_hour')::numeric,0)<=0 then raise exception 'Configure LPG equipment consumption before costing usage'; end if;
        if used>0 and rate<=0 then raise exception 'Configure LPG cylinder price before costing usage'; end if;
        if productive_hours>0 then utilities:=utilities+used*rate/productive_hours; end if;
      else raise exception 'Unknown utility kind'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(coalesce(cfg->'overhead_items','[]'::jsonb)) where coalesce((value->>'monthly_cost')::numeric,0)<0) then raise exception 'Overhead monthly values cannot be negative'; end if;
    select coalesce(sum((value->>'monthly_cost')::numeric),0) into overhead_monthly
      from jsonb_array_elements(coalesce(cfg->'overhead_items','[]'::jsonb)) where coalesce((value->>'active')::boolean,false);
    productive_hours:=greatest(0,coalesce((cfg->>'productive_hours_per_month')::numeric,0));
    if overhead_monthly>0 and productive_hours<=0 then raise exception 'Configure productive hours greater than zero for monthly overhead'; end if;
    allocation_hours:=coalesce(nullif(new.costing_snapshot->>'overhead_allocation_hours','')::numeric,new.labor_hours);
    if allocation_hours<0 then raise exception 'Overhead allocation hours cannot be negative'; end if;
    new.utilities_total:=round(utilities,2);
    new.overhead_amount:=case when productive_hours>0 then round(overhead_monthly/productive_hours*allocation_hours,2) else 0 end;
    new.costing_snapshot:=jsonb_set(coalesce(new.costing_snapshot,'{}'::jsonb),'{config_snapshot}',cfg,true);
    new.costing_snapshot:=jsonb_set(new.costing_snapshot,'{overhead_allocation_hours}',to_jsonb(allocation_hours),true);
    new.indirect_percent:=0; new.indirect_amount:=0;
    new.production_subtotal:=round(new.ingredients_cost+new.waste_amount+d+new.labor_cost+new.utilities_total,2);
    new.production_cost:=new.production_subtotal+new.overhead_amount;
  else
    -- Legacy snapshots remain governed by the historical percentage formula.
    new.utilities_total:=0; new.overhead_amount:=0;
    new.production_subtotal:=new.ingredients_cost+new.waste_amount+d+new.labor_cost;
    new.indirect_amount:=round(new.production_subtotal*new.indirect_percent/100,2);
    new.production_cost:=new.production_subtotal+new.indirect_amount;
  end if;
  new.total_internal_cost:=new.production_cost;
  new.suggested_line_price:=round(new.production_cost*(1+new.markup_percent/100),2);
  new.updated_at:=now(); return new;
end $$;
revoke all on function private.calculate_arpe_item_cost() from public,anon,authenticated;

-- Replace bundle writer so new inputs are retained and the trigger recomputes all
-- monetary outputs. No browser-supplied total is trusted.
create or replace function private.save_arpe_quote_bundle(p_quote_id uuid,p_header jsonb,p_items jsonb)
returns setof public.arpe_quotes language plpgsql security definer set search_path='' as $$
declare b uuid; q public.arpe_quotes; i jsonb; c jsonb; item_id uuid; pos integer:=0; subtotal numeric:=0; first_item jsonb; v integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into b from public.arpe_businesses where owner_id=auth.uid();
  if b is null then raise exception 'Business not found'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'La cotización necesita entre 1 y 100 productos.'; end if;
  if p_quote_id is not null then
    select * into q from public.arpe_quotes where id=p_quote_id and business_id=b for update;
    if not found then raise exception 'Quote not found or access denied'; end if;
    if exists(select 1 from public.arpe_orders where quote_id=q.id) then raise exception 'Esta cotización ya generó un pedido.'; end if;
  end if;
  for i in select value from jsonb_array_elements(p_items) loop
    if i->>'quantity' is null or i->>'unit_price' is null or not ((i->>'quantity')::numeric>0 and (i->>'quantity')::numeric<1000000000) or not ((i->>'unit_price')::numeric>=0 and (i->>'unit_price')::numeric<10000000000) then raise exception 'Invalid quantity or unit price'; end if;
    subtotal:=subtotal+round(round((i->>'quantity')::numeric,3)*round((i->>'unit_price')::numeric,2),2);
  end loop;
  first_item:=p_items->0;
  if p_quote_id is null then insert into public.arpe_quotes(business_id,customer_name,product,total_amount) values(b,p_header->>'customer_name',first_item->>'product',subtotal+coalesce((p_header->>'delivery_customer_charge')::numeric,0)) returning * into q; end if;
  update public.arpe_quotes set customer_name=p_header->>'customer_name',customer_phone=coalesce(p_header->>'customer_phone',''),product=first_item->>'product',portions=(first_item->>'portions')::integer,flavor=coalesce(first_item->>'flavor',''),filling=coalesce(first_item->>'filling',''),decoration=coalesce(first_item->>'decoration',''),extras=coalesce(first_item->>'extras',''),delivery_date=nullif(p_header->>'delivery_date','')::date,delivery_time=nullif(p_header->>'delivery_time','')::time,notes=coalesce(p_header->>'notes',''),status=p_header->>'status',deposit_type=p_header->>'deposit_type',deposit_value=(p_header->>'deposit_value')::numeric,delivery_internal_cost=coalesce((p_header->>'delivery_internal_cost')::numeric,0),delivery_customer_charge=coalesce((p_header->>'delivery_customer_charge')::numeric,0),total_amount=subtotal+round(coalesce((p_header->>'delivery_customer_charge')::numeric,0),2) where id=q.id returning * into q;
  delete from public.arpe_quote_items where quote_id=q.id;
  for i in select value from jsonb_array_elements(p_items) loop
    pos:=pos+1;
    insert into public.arpe_quote_items(business_id,quote_id,catalog_product_id,position,product,quantity,unit_label,portions,flavor,filling,decoration,extras,notes,unit_price) values(b,q.id,(i->>'catalog_product_id')::uuid,pos,i->>'product',(i->>'quantity')::numeric,i->>'unit_label',(i->>'portions')::integer,coalesce(i->>'flavor',''),coalesce(i->>'filling',''),coalesce(i->>'decoration',''),coalesce(i->>'extras',''),coalesce(i->>'notes',''),(i->>'unit_price')::numeric) returning id into item_id;
    c:=i->'cost';
    if c is not null and c <> 'null'::jsonb then
      insert into public.arpe_quote_item_cost_items(business_id,quote_item_id,category,name,cost) select b,item_id,x->>'category',x->>'name',(x->>'cost')::numeric from jsonb_array_elements(coalesce(i->'direct_costs','[]'::jsonb)) x;
      v:=case when c->>'costing_model_version'='1' then 1 else 0 end;
      insert into public.arpe_quote_item_costs(quote_item_id,business_id,ingredients_cost,waste_percent,labor_hours,labor_hourly_rate,indirect_percent,markup_percent,costing_model_version,costing_snapshot)
      values(item_id,b,(c->>'ingredients_cost')::numeric,(c->>'waste_percent')::numeric,(c->>'labor_hours')::numeric,(c->>'labor_hourly_rate')::numeric,case when v=1 then 0 else (c->>'indirect_percent')::numeric end,(c->>'markup_percent')::numeric,v,case when v=1 then jsonb_build_object('version',1,'utilities',coalesce(c->'utilities',c->'costing_snapshot'->'utilities','[]'::jsonb),'overhead_allocation_hours',coalesce(c->'overhead_allocation_hours',c->'costing_snapshot'->'overhead_allocation_hours',(c->>'labor_hours')::jsonb),'config_snapshot',coalesce(c->'costing_snapshot'->'config_snapshot',c->'costing_snapshot'->'costing_config',c->'costing_config')) else null end);
    elsif jsonb_array_length(coalesce(i->'direct_costs','[]'::jsonb))>0 then raise exception 'Direct costs require item costing'; end if;
  end loop;
  return next q;
end $$;
revoke all on function private.save_arpe_quote_bundle(uuid,jsonb,jsonb) from public,anon;
grant execute on function private.save_arpe_quote_bundle(uuid,jsonb,jsonb) to authenticated;

-- Carry item cost version and immutable input/config snapshot into orders.
create or replace function private.convert_arpe_quote_to_order(p_quote_id uuid)
returns setof public.arpe_orders language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=(select auth.uid()); v_quote public.arpe_quotes; v_order public.arpe_orders; v_internal_cost numeric(12,2); v_profit numeric(12,2); v_margin numeric(12,4); v_year integer:=extract(year from now())::integer; v_number integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select q.* into v_quote from public.arpe_quotes q join public.arpe_businesses b on b.id=q.business_id where q.id=p_quote_id and b.owner_id=v_user_id for update of q;
  if not found then raise exception 'Quote not found or access denied'; end if;
  select o.* into v_order from public.arpe_orders o where o.quote_id=v_quote.id and o.business_id=v_quote.business_id;
  if found then return next v_order; return; end if;
  if v_quote.status<>'accepted' then raise exception 'Only accepted quotes can become orders'; end if;
  if not exists(select 1 from public.arpe_quote_items where quote_id=v_quote.id) then raise exception 'Quote has no items'; end if;
  select case when count(c.quote_item_id)=count(*) then sum(c.total_internal_cost)+v_quote.delivery_internal_cost end into v_internal_cost from public.arpe_quote_items i left join public.arpe_quote_item_costs c on c.quote_item_id=i.id where i.quote_id=v_quote.id;
  if v_internal_cost is not null then v_profit:=round(v_quote.total_amount-v_internal_cost,2); if v_quote.total_amount>0 then v_margin:=round(v_profit/v_quote.total_amount*100,4); end if; end if;
  insert into private.arpe_order_sequences(business_id,sequence_year,next_number) values(v_quote.business_id,v_year,2) on conflict(business_id,sequence_year) do update set next_number=private.arpe_order_sequences.next_number+1 returning next_number-1 into v_number;
  insert into public.arpe_orders(business_id,quote_id,order_number,source_quote_number,customer_name,customer_phone,product,portions,flavor,filling,decoration,extras,delivery_date,delivery_time,notes,total_amount,deposit_type,deposit_value,deposit_required,internal_cost_total,estimated_profit,real_margin_percent,status,delivery_internal_cost,delivery_customer_charge)
  values(v_quote.business_id,v_quote.id,format('ARPE-PED-%s-%s',v_year,lpad(v_number::text,4,'0')),v_quote.quote_number,v_quote.customer_name,v_quote.customer_phone,v_quote.product,v_quote.portions,v_quote.flavor,v_quote.filling,v_quote.decoration,v_quote.extras,v_quote.delivery_date,v_quote.delivery_time,v_quote.notes,v_quote.total_amount,v_quote.deposit_type,v_quote.deposit_value,v_quote.deposit_required,v_internal_cost,v_profit,v_margin,'confirmed',v_quote.delivery_internal_cost,v_quote.delivery_customer_charge) returning * into v_order;
  insert into public.arpe_order_items(business_id,order_id,source_quote_item_id,position,product,quantity,unit_label,portions,flavor,filling,decoration,extras,notes,unit_price,internal_cost_total,estimated_profit,real_margin_percent,costing_model_version,costing_snapshot)
  select i.business_id,v_order.id,i.id,i.position,i.product,i.quantity,i.unit_label,i.portions,i.flavor,i.filling,i.decoration,i.extras,i.notes,i.unit_price,c.total_internal_cost,case when c.quote_item_id is not null then i.line_total-c.total_internal_cost end,case when c.quote_item_id is not null and i.line_total>0 then round((i.line_total-c.total_internal_cost)/i.line_total*100,4) end,c.costing_model_version,c.costing_snapshot from public.arpe_quote_items i left join public.arpe_quote_item_costs c on c.quote_item_id=i.id where i.quote_id=v_quote.id order by i.position;
  return next v_order;
end $$;
revoke all on function private.convert_arpe_quote_to_order(uuid) from public,anon;
grant execute on function private.convert_arpe_quote_to_order(uuid) to authenticated;

-- Historical records are explicitly legacy; never rewrite historical formulas.
update public.arpe_quote_item_costs set costing_model_version=0 where costing_model_version is null;
