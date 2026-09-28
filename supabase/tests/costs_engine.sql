begin;
do $$ begin
  if not exists (select 1 from public.arpe_businesses) then raise exception 'No business available for cost engine test'; end if;
  if not exists (select 1 from public.arpe_quotes) then raise exception 'No quote available for cost engine test'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from public.arpe_businesses limit 1), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.arpe_quote_cost_items (quote_id, business_id, category, name, cost)
select q.id, q.business_id, 'packaging', 'Caja de prueba', 80
from public.arpe_quotes q limit 1;
insert into public.arpe_quote_costs (quote_id, business_id, ingredients_cost, waste_percent, labor_hours, labor_hourly_rate, indirect_percent, delivery_internal_cost, delivery_customer_charge, markup_percent)
select q.id, q.business_id, 1000, 12, 3, 100, 12, 100, 150, 60
from public.arpe_quotes q limit 1;

do $$
declare c public.arpe_quote_costs;
begin
  select * into c from public.arpe_quote_costs limit 1;
  if c.waste_amount <> 120 or c.labor_cost <> 300 or c.production_subtotal <> 1400 or c.indirect_amount <> 168 or c.total_internal_cost <> 1668 or c.suggested_customer_total <> 2618 then
    raise exception 'Cost formulas did not match expected values';
  end if;
end $$;
select 'PASS: cost engine formulas and owner RLS path' as result;
rollback;
