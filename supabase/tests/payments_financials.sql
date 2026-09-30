begin;

do $$
begin
  if not exists (select 1 from public.arpe_orders where order_number = 'ARPE-PED-2026-0001') then
    raise exception 'Missing the existing ARPE-PED-2026-0001 order';
  end if;
  if exists (
    select 1 from public.arpe_payments p
    join public.arpe_orders o on o.id = p.order_id
    where o.order_number = 'ARPE-PED-2026-0001' and p.status = 'posted'
  ) then
    raise exception 'ARPE-PED-2026-0001 already has posted payments; the zero-payment baseline test cannot run';
  end if;
end $$;

select set_config(
  'request.jwt.claim.sub',
  (select b.owner_id::text from public.arpe_businesses b join public.arpe_orders o on o.business_id = b.id where o.order_number = 'ARPE-PED-2026-0001'),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_order public.arpe_orders;
  v_first public.arpe_payments;
  v_repeat public.arpe_payments;
  v_second public.arpe_payments;
  v_final public.arpe_payments;
  v_voided public.arpe_payments;
  v_paid numeric(12,2);
  v_visible integer;
begin
  select * into v_order from public.arpe_orders where order_number = 'ARPE-PED-2026-0001';
  if v_order.total_amount <> 1800 or v_order.deposit_required <> 500 then
    raise exception 'The existing order no longer matches the C$1,800 / C$500 payment fixture';
  end if;
  select coalesce(sum(amount), 0) into v_paid
    from public.arpe_payments where order_id = v_order.id and status = 'posted';
  if v_paid <> 0 then raise exception 'The required deposit must not be counted as received'; end if;

  select * into v_first from public.arpe_register_payment(
    v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 500, 'bank_transfer',
    'TEST-TRANSFER-1', 'Anticipo de prueba', now()
  ) limit 1;
  select * into v_repeat from public.arpe_register_payment(
    v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 500, 'bank_transfer',
    'TEST-TRANSFER-1', 'Reintento idempotente', now()
  ) limit 1;
  if v_first.id <> v_repeat.id or v_first.payment_number <> v_repeat.payment_number then
    raise exception 'The same request_id created a duplicate payment';
  end if;
  if v_first.payment_number !~ '^ARPE-PAG-2026-[0-9]{4,}$' then raise exception 'Payment numbering format mismatch'; end if;

  select * into v_second from public.arpe_register_payment(
    v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 1000, 'cash', '', '', now()
  ) limit 1;
  begin
    perform * from public.arpe_register_payment(
      v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 0, 'cash', '', '', now()
    );
    raise exception 'TEST_FAILED: zero payment was accepted';
  exception when others then
    if sqlerrm not like 'Payment amount must be greater than zero%' then raise; end if;
  end;
  begin
    perform * from public.arpe_register_payment(
      v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', -1, 'cash', '', '', now()
    );
    raise exception 'TEST_FAILED: negative payment was accepted';
  exception when others then
    if sqlerrm not like 'Payment amount must be greater than zero%' then raise; end if;
  end;
  begin
    perform * from public.arpe_register_payment(
      v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 300.01, 'cash', '', '', now()
    );
    raise exception 'TEST_FAILED: overpayment was accepted';
  exception when others then
    if sqlerrm not like 'Payment exceeds remaining balance:%' then raise; end if;
  end;

  select * into v_final from public.arpe_register_payment(
    v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', 300, 'mobile_payment', '', '', now()
  ) limit 1;
  select coalesce(sum(amount), 0) into v_paid
    from public.arpe_payments where order_id = v_order.id and status = 'posted';
  if v_paid <> 1800 then raise exception 'Multiple payments did not sum to the order total'; end if;
  begin
    perform * from public.arpe_register_payment(
      v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', 0.01, 'cash', '', '', now()
    );
    raise exception 'TEST_FAILED: an additional payment was accepted on a fully paid order';
  exception when others then
    if sqlerrm not like 'Payment exceeds remaining balance:%' then raise; end if;
  end;

  select * into v_voided from public.arpe_void_payment(v_final.id, 'Pago duplicado en el ejemplo de prueba') limit 1;
  if v_voided.status <> 'voided' or v_voided.voided_at is null or v_voided.void_reason is null then
    raise exception 'Voiding did not preserve the audit fields';
  end if;
  select coalesce(sum(amount), 0) into v_paid
    from public.arpe_payments where order_id = v_order.id and status = 'posted';
  if v_paid <> 1500 then raise exception 'A voided payment still counts as money received'; end if;
  begin
    perform * from public.arpe_void_payment(v_final.id, 'Segunda anulación');
    raise exception 'TEST_FAILED: a payment was voided twice';
  exception when others then
    if sqlerrm not like 'Only posted payments can be voided%' then raise; end if;
  end;
  begin
    perform * from public.arpe_void_payment(v_first.id, '   ');
    raise exception 'TEST_FAILED: an empty void reason was accepted';
  exception when others then
    if sqlerrm not like 'A reason is required%' then raise; end if;
  end;

  perform * from public.arpe_update_order_status(v_order.id, 'cancelled');
  begin
    perform * from public.arpe_register_payment(
      v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', 1, 'cash', '', '', now()
    );
    raise exception 'TEST_FAILED: payment was accepted for a cancelled order';
  exception when others then
    if sqlerrm not like 'Payments cannot be registered for cancelled orders%' then raise; end if;
  end;
  perform * from public.arpe_update_order_status(v_order.id, 'delivered');

  perform set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', true);
  select count(*) into v_visible from public.arpe_payments;
  if v_visible <> 0 then raise exception 'Another user can read this business payments'; end if;
  begin
    perform * from public.arpe_register_payment(
      v_order.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9', 1, 'cash', '', '', now()
    );
    raise exception 'TEST_FAILED: another business owner registered a payment';
  exception when others then
    if sqlerrm not like 'Order not found or access denied%' then raise; end if;
  end;
end $$;

select 'PASS: live order starts unpaid; payment sums, replay idempotency, amount guards, delivered/cancelled rules, void audit and RLS pass' as result;
rollback;
