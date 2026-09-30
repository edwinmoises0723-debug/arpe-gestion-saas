create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.arpe_order_delivery_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.arpe_businesses(id) on delete restrict,
  order_id uuid not null,
  previous_delivery_date date,
  previous_delivery_time time,
  new_delivery_date date not null,
  new_delivery_time time,
  reason text not null default '' check (char_length(reason) <= 500),
  changed_at timestamptz not null default now(),
  changed_by uuid not null,
  constraint arpe_order_delivery_history_order_business_fk
    foreign key (order_id, business_id) references public.arpe_orders(id, business_id) on delete restrict
);

create index arpe_order_delivery_history_business_order_idx
  on public.arpe_order_delivery_history (business_id, order_id, changed_at desc);

alter table public.arpe_order_delivery_history enable row level security;
revoke all on public.arpe_order_delivery_history from public, anon, authenticated;
grant select on public.arpe_order_delivery_history to authenticated;

create policy arpe_order_delivery_history_owner_select
  on public.arpe_order_delivery_history for select to authenticated
  using (exists (
    select 1 from public.arpe_businesses b
    where b.id = business_id and b.owner_id = (select auth.uid())
  ));

create function private.reschedule_arpe_order_delivery(
  p_order_id uuid,
  p_new_delivery_date date,
  p_new_delivery_time time,
  p_reason text
)
returns setof public.arpe_orders
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.arpe_orders;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_new_delivery_date is null then raise exception 'Delivery date is required'; end if;

  select o.* into v_order
    from public.arpe_orders o
    join public.arpe_businesses b on b.id = o.business_id
   where o.id = p_order_id and b.owner_id = v_user_id
   for update of o;
  if not found then raise exception 'Order not found or access denied'; end if;
  if v_order.status not in ('confirmed', 'in_preparation', 'ready') then
    raise exception 'Delivered or cancelled orders cannot be rescheduled';
  end if;

  if v_order.delivery_date is not distinct from p_new_delivery_date
     and v_order.delivery_time is not distinct from p_new_delivery_time then
    return next v_order;
    return;
  end if;

  insert into public.arpe_order_delivery_history (
    business_id, order_id, previous_delivery_date, previous_delivery_time,
    new_delivery_date, new_delivery_time, reason, changed_by
  ) values (
    v_order.business_id, v_order.id, v_order.delivery_date, v_order.delivery_time,
    p_new_delivery_date, p_new_delivery_time, coalesce(nullif(btrim(p_reason), ''), ''), v_user_id
  );

  update public.arpe_orders o
     set delivery_date = p_new_delivery_date,
         delivery_time = p_new_delivery_time,
         updated_at = now()
   where o.id = v_order.id
  returning * into v_order;

  return next v_order;
end;
$$;
revoke all on function private.reschedule_arpe_order_delivery(uuid, date, time, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.reschedule_arpe_order_delivery(uuid, date, time, text) to authenticated;

create function public.arpe_reschedule_order_delivery(
  p_order_id uuid,
  p_new_delivery_date date,
  p_new_delivery_time time,
  p_reason text
)
returns setof public.arpe_orders
language sql security invoker set search_path = '' as $$
  select * from private.reschedule_arpe_order_delivery(
    p_order_id, p_new_delivery_date, p_new_delivery_time, p_reason
  );
$$;
revoke all on function public.arpe_reschedule_order_delivery(uuid, date, time, text) from public, anon;
grant execute on function public.arpe_reschedule_order_delivery(uuid, date, time, text) to authenticated;
