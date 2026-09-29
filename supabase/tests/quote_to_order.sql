begin;
do $$ begin
  if not exists (select 1 from public.arpe_businesses) then raise exception 'No business available for order conversion test'; end if;
  if not exists (select 1 from public.arpe_quotes where status = 'accepted') then raise exception 'No accepted quote available for order conversion test'; end if;
  if not exists (select 1 from public.arpe_quotes where status <> 'accepted') then raise exception 'No non-accepted quote available for order conversion test'; end if;
end $$;
select set_config('request.jwt.claim.sub', (select owner_id::text from public.arpe_businesses limit 1), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  accepted_quote public.arpe_quotes;
  pending_quote public.arpe_quotes;
  created_order public.arpe_orders;
  repeated_order public.arpe_orders;
  changed_order public.arpe_orders;
  expected_internal_cost numeric(12,2);
  visible_count integer;
begin
  select * into accepted_quote from public.arpe_quotes where status = 'accepted' limit 1;
  select * into pending_quote from public.arpe_quotes where status <> 'accepted' limit 1;
  select total_internal_cost into expected_internal_cost from public.arpe_quote_costs where quote_id = accepted_quote.id;

  select * into created_order from public.arpe_convert_quote_to_order(accepted_quote.id) limit 1;
  select * into repeated_order from public.arpe_convert_quote_to_order(accepted_quote.id) limit 1;
  if created_order.id is distinct from repeated_order.id then raise exception 'Repeated conversion returned a different order'; end if;
  if created_order.quote_id <> accepted_quote.id or created_order.business_id <> accepted_quote.business_id then raise exception 'Order relationship snapshot mismatch'; end if;
  if created_order.source_quote_number <> accepted_quote.quote_number or created_order.customer_name <> accepted_quote.customer_name or created_order.product <> accepted_quote.product then raise exception 'Order commercial snapshot mismatch'; end if;
  if created_order.total_amount <> accepted_quote.total_amount or created_order.deposit_required <> accepted_quote.deposit_required then raise exception 'Order financial snapshot mismatch'; end if;
  if created_order.status <> 'confirmed' then raise exception 'New order did not start confirmed'; end if;
  if created_order.order_number !~ '^ARPE-PED-[0-9]{4}-[0-9]{4,}$' then raise exception 'Order numbering format mismatch'; end if;
  if expected_internal_cost is null and (created_order.internal_cost_total is not null or created_order.estimated_profit is not null or created_order.real_margin_percent is not null) then raise exception 'Cost snapshot should be null when no quote costing exists'; end if;
  if expected_internal_cost is not null and created_order.internal_cost_total is distinct from expected_internal_cost then raise exception 'Internal cost snapshot mismatch'; end if;

  update public.arpe_quotes set product = product || ' (test change)' where id = accepted_quote.id;
  select * into repeated_order from public.arpe_orders where id = created_order.id;
  if repeated_order.product <> created_order.product then raise exception 'Order changed after its source quote was edited'; end if;

  select count(*) into visible_count from public.arpe_orders where quote_id = accepted_quote.id;
  if visible_count <> 1 then raise exception 'Conversion created duplicate orders'; end if;

  begin
    perform * from public.arpe_convert_quote_to_order(pending_quote.id);
    raise exception 'TEST_FAILED: non-accepted quote converted';
  exception when others then
    if sqlerrm not like 'Only accepted quotes can become orders%' then raise; end if;
  end;

  select * into changed_order from public.arpe_update_order_status(created_order.id, 'in_preparation') limit 1;
  if changed_order.status <> 'in_preparation' then raise exception 'Order status update failed'; end if;

  perform set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
  select count(*) into visible_count from public.arpe_orders;
  if visible_count <> 0 then raise exception 'Another user can read this business orders'; end if;
end $$;

select 'PASS: accepted conversion is atomic/idempotent; non-accepted quotes are rejected; snapshot, numbering, status and RLS are verified' as result;
rollback;
