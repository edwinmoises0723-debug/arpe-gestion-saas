drop index if exists public.arpe_payments_order_created_idx;
create index arpe_payments_order_business_created_idx
  on public.arpe_payments (order_id, business_id, created_at desc);
