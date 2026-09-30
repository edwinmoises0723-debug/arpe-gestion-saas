alter table public.arpe_orders
  add constraint arpe_orders_id_business_unique unique (id, business_id);

create table public.arpe_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  order_id uuid not null,
  payment_number text not null,
  request_id uuid not null unique,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('cash', 'bank_transfer', 'bank_deposit', 'card', 'mobile_payment', 'other')),
  reference text not null default '',
  notes text not null default '',
  paid_at timestamptz not null,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text,
  unique (business_id, payment_number),
  constraint arpe_payments_order_business_fk
    foreign key (order_id, business_id) references public.arpe_orders(id, business_id) on delete restrict,
  constraint arpe_payments_void_audit_check check (
    (status = 'posted' and voided_at is null and void_reason is null)
    or
    (status = 'voided' and voided_at is not null and nullif(btrim(void_reason), '') is not null)
  )
);

create index arpe_payments_business_paid_idx on public.arpe_payments (business_id, paid_at desc);
create index arpe_payments_order_created_idx on public.arpe_payments (order_id, created_at desc);

create table private.arpe_payment_sequences (
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  sequence_year integer not null,
  next_number integer not null default 1 check (next_number > 0),
  primary key (business_id, sequence_year)
);
alter table private.arpe_payment_sequences enable row level security;
revoke all on private.arpe_payment_sequences from public, anon, authenticated;

alter table public.arpe_payments enable row level security;
revoke all on public.arpe_payments from public, anon, authenticated;
grant select on public.arpe_payments to authenticated;
create policy arpe_payments_owner_select on public.arpe_payments for select to authenticated
using (exists (
  select 1 from public.arpe_businesses b
  where b.id = business_id and b.owner_id = (select auth.uid())
));

create function private.register_arpe_payment(
  p_order_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_notes text,
  p_paid_at timestamptz
)
returns setof public.arpe_payments
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.arpe_orders;
  v_payment public.arpe_payments;
  v_paid numeric(12,2);
  v_balance numeric(12,2);
  v_number integer;
  v_year integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request ID is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_method is null or p_method not in ('cash', 'bank_transfer', 'bank_deposit', 'card', 'mobile_payment', 'other') then
    raise exception 'Invalid payment method';
  end if;
  if p_paid_at is null then raise exception 'Payment date is required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select o.* into v_order
    from public.arpe_orders o
    join public.arpe_businesses b on b.id = o.business_id
   where o.id = p_order_id and b.owner_id = v_user_id
   for update of o;
  if not found then raise exception 'Order not found or access denied'; end if;

  select p.* into v_payment from public.arpe_payments p where p.request_id = p_request_id;
  if found then
    if v_payment.order_id = v_order.id and v_payment.business_id = v_order.business_id then
      return next v_payment;
      return;
    end if;
    raise exception 'Request ID has already been used';
  end if;

  if v_order.status = 'cancelled' then raise exception 'Payments cannot be registered for cancelled orders'; end if;

  select coalesce(sum(p.amount), 0)::numeric(12,2) into v_paid
    from public.arpe_payments p
   where p.order_id = v_order.id and p.business_id = v_order.business_id and p.status = 'posted';
  v_balance := greatest(0, v_order.total_amount - v_paid);
  if p_amount > v_balance then
    raise exception 'Payment exceeds remaining balance: %', to_char(v_balance, 'FM999999999990.00');
  end if;

  v_year := extract(year from p_paid_at)::integer;
  insert into private.arpe_payment_sequences (business_id, sequence_year, next_number)
  values (v_order.business_id, v_year, 2)
  on conflict (business_id, sequence_year) do update
    set next_number = private.arpe_payment_sequences.next_number + 1
  returning next_number - 1 into v_number;

  insert into public.arpe_payments (
    business_id, order_id, payment_number, request_id, amount, method, reference, notes, paid_at
  ) values (
    v_order.business_id,
    v_order.id,
    format('ARPE-PAG-%s-%s', v_year, lpad(v_number::text, 4, '0')),
    p_request_id,
    round(p_amount, 2),
    p_method,
    coalesce(btrim(p_reference), ''),
    coalesce(btrim(p_notes), ''),
    p_paid_at
  ) returning * into v_payment;
  return next v_payment;
end;
$$;
revoke all on function private.register_arpe_payment(uuid, uuid, numeric, text, text, text, timestamptz) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.register_arpe_payment(uuid, uuid, numeric, text, text, text, timestamptz) to authenticated;

create function private.void_arpe_payment(p_payment_id uuid, p_void_reason text)
returns setof public.arpe_payments
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.arpe_orders;
  v_payment public.arpe_payments;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_void_reason is null or btrim(p_void_reason) = '' then raise exception 'A reason is required to void a payment'; end if;

  select o.* into v_order
    from public.arpe_orders o
    join public.arpe_payments p on p.order_id = o.id and p.business_id = o.business_id
    join public.arpe_businesses b on b.id = o.business_id
   where p.id = p_payment_id and b.owner_id = v_user_id
   for update of o;
  if not found then raise exception 'Payment not found or access denied'; end if;

  select p.* into v_payment
    from public.arpe_payments p
   where p.id = p_payment_id and p.business_id = v_order.business_id
   for update;
  if not found then raise exception 'Payment not found or access denied'; end if;
  if v_payment.status <> 'posted' then raise exception 'Only posted payments can be voided'; end if;

  update public.arpe_payments
     set status = 'voided', voided_at = now(), void_reason = btrim(p_void_reason), updated_at = now()
   where id = v_payment.id
   returning * into v_payment;
  return next v_payment;
end;
$$;
revoke all on function private.void_arpe_payment(uuid, text) from public, anon;
grant execute on function private.void_arpe_payment(uuid, text) to authenticated;

create function public.arpe_register_payment(
  p_order_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_notes text,
  p_paid_at timestamptz
)
returns setof public.arpe_payments
language sql security invoker set search_path = '' as $$
  select * from private.register_arpe_payment(p_order_id, p_request_id, p_amount, p_method, p_reference, p_notes, p_paid_at);
$$;
revoke all on function public.arpe_register_payment(uuid, uuid, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.arpe_register_payment(uuid, uuid, numeric, text, text, text, timestamptz) to authenticated;

create function public.arpe_void_payment(p_payment_id uuid, p_void_reason text)
returns setof public.arpe_payments
language sql security invoker set search_path = '' as $$
  select * from private.void_arpe_payment(p_payment_id, p_void_reason);
$$;
revoke all on function public.arpe_void_payment(uuid, text) from public, anon;
grant execute on function public.arpe_void_payment(uuid, text) to authenticated;
