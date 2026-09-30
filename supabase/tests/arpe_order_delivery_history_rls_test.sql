begin;
select plan(1);
do $$ begin
  if not exists (select 1 from public.arpe_orders where status in ('confirmed', 'in_preparation', 'ready') and delivery_date is not null) then
    raise exception 'Create at least one active dated order before running the delivery rescheduling test';
  end if;
end $$;

select set_config(
  'request.jwt.claim.sub',
  (select b.owner_id::text from public.arpe_businesses b
   join public.arpe_orders o on o.business_id = b.id
   where o.status in ('confirmed', 'in_preparation', 'ready') and o.delivery_date is not null limit 1),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_order public.arpe_orders;
  v_updated public.arpe_orders;
  v_history public.arpe_order_delivery_history;
  v_status text;
  v_date date;
  v_time time;
  v_expected_date date;
  v_expected_time time;
  v_history_count integer;
  v_current_count integer;
  v_paid_before numeric(12,2);
  v_paid_after numeric(12,2);
  v_visible_count integer;
begin
  select * into v_order from public.arpe_orders where status in ('confirmed', 'in_preparation', 'ready') and delivery_date is not null order by created_at limit 1;
  if not found then raise exception 'No active order is available for the test'; end if;
  v_expected_date := v_order.delivery_date;
  v_expected_time := v_order.delivery_time;

  select count(*) into v_history_count from public.arpe_order_delivery_history where order_id = v_order.id;
  select coalesce(sum(amount), 0) into v_paid_before from public.arpe_payments where order_id = v_order.id and status = 'posted';

  select * into v_updated from public.arpe_reschedule_order_delivery(
    v_order.id, v_order.delivery_date, v_order.delivery_time, 'No debe crear un registro'
  ) limit 1;
  select count(*) into v_current_count from public.arpe_order_delivery_history where order_id = v_order.id;
  if v_current_count <> v_history_count then raise exception 'Unchanged delivery created an unnecessary history row'; end if;

  foreach v_status in array array['confirmed', 'in_preparation', 'ready'] loop
    perform * from public.arpe_update_order_status(v_order.id, v_status);
    v_date := current_date + case v_status when 'confirmed' then 1 when 'in_preparation' then 2 else 3 end;
    v_time := case when v_status = 'in_preparation' then null else time '15:00' end;
    select * into v_updated from public.arpe_reschedule_order_delivery(v_order.id, v_date, v_time, 'Cambio confirmado') limit 1;

    if v_updated.delivery_date <> v_date or v_updated.delivery_time is distinct from v_time then
      raise exception 'Delivery date/time did not update correctly for status %', v_status;
    end if;
    if v_updated.status <> v_status then raise exception 'Rescheduling changed order status %', v_status; end if;
    select * into v_history from public.arpe_order_delivery_history
     where order_id = v_order.id and new_delivery_date = v_date and new_delivery_time is not distinct from v_time;
    if not found then raise exception 'Delivery history was not written for status %', v_status; end if;
    if v_history.previous_delivery_date is distinct from v_expected_date
       or v_history.previous_delivery_time is distinct from v_expected_time
       or v_history.reason <> 'Cambio confirmado'
       or v_history.changed_by <> auth.uid() then
      raise exception 'Delivery history audit values are incorrect';
    end if;
    v_expected_date := v_date;
    v_expected_time := v_time;
  end loop;

  perform * from public.arpe_update_order_status(v_order.id, 'delivered');
  begin
    perform * from public.arpe_reschedule_order_delivery(v_order.id, current_date + 4, time '16:00', 'No permitido');
    raise exception 'TEST_FAILED: delivered order was rescheduled';
  exception when others then
    if sqlerrm not like 'Delivered or cancelled orders cannot be rescheduled%' then raise; end if;
  end;
  perform * from public.arpe_update_order_status(v_order.id, 'cancelled');
  begin
    perform * from public.arpe_reschedule_order_delivery(v_order.id, current_date + 5, time '16:00', 'No permitido');
    raise exception 'TEST_FAILED: cancelled order was rescheduled';
  exception when others then
    if sqlerrm not like 'Delivered or cancelled orders cannot be rescheduled%' then raise; end if;
  end;

  select count(*) into v_current_count from public.arpe_order_delivery_history where order_id = v_order.id;
  if v_current_count <> v_history_count + 3 then raise exception 'Unexpected delivery history row count'; end if;
  select coalesce(sum(amount), 0) into v_paid_after from public.arpe_payments where order_id = v_order.id and status = 'posted';
  if v_paid_after <> v_paid_before then raise exception 'Rescheduling changed recorded payments'; end if;
  select * into v_updated from public.arpe_orders where id = v_order.id;
  if v_updated.total_amount <> v_order.total_amount or v_updated.deposit_required <> v_order.deposit_required
     or v_updated.internal_cost_total is distinct from v_order.internal_cost_total then
    raise exception 'Rescheduling changed order financial values';
  end if;

  perform set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
  select count(*) into v_visible_count from public.arpe_order_delivery_history where order_id = v_order.id;
  if v_visible_count <> 0 then raise exception 'Another business owner can read delivery history'; end if;
  begin
    perform * from public.arpe_reschedule_order_delivery(v_order.id, current_date + 6, time '17:00', 'No access');
    raise exception 'TEST_FAILED: another business owner rescheduled this order';
  exception when others then
    if sqlerrm not like 'Order not found or access denied%' then raise; end if;
  end;
  begin
    insert into public.arpe_order_delivery_history (
      business_id, order_id, previous_delivery_date, new_delivery_date, changed_by
    ) values (v_order.business_id, v_order.id, v_order.delivery_date, current_date + 7, auth.uid());
    raise exception 'TEST_FAILED: direct history insert was allowed';
  exception when insufficient_privilege then null; end;
end $$;

select ok(true, 'active states, closed-state guards, optional hour, no-op, audit, financial invariants and tenant isolation');
select * from finish();
rollback;
