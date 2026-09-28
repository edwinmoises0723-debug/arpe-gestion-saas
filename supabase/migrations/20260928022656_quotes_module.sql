-- Cotizaciones Fase 2. No modifica tablas ni datos de Fase 1.
create table public.arpe_quote_sequences (
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  sequence_year integer not null,
  next_number integer not null default 1 check (next_number > 0),
  primary key (business_id, sequence_year)
);

create table public.arpe_quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  quote_number text not null,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 120),
  customer_phone text not null default '' check (char_length(customer_phone) <= 30),
  product text not null check (char_length(trim(product)) between 1 and 160),
  portions integer check (portions is null or portions > 0),
  flavor text not null default '' check (char_length(flavor) <= 120),
  filling text not null default '' check (char_length(filling) <= 120),
  decoration text not null default '' check (char_length(decoration) <= 500),
  extras text not null default '' check (char_length(extras) <= 500),
  delivery_date date,
  delivery_time time,
  notes text not null default '' check (char_length(notes) <= 1000),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  deposit_type text not null default 'percentage' check (deposit_type in ('percentage', 'fixed')),
  deposit_value numeric(12,2) not null default 0 check (deposit_value >= 0),
  deposit_required numeric(12,2) not null default 0 check (deposit_required >= 0 and deposit_required <= total_amount),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quote_number)
);

create index arpe_quotes_business_created_idx on public.arpe_quotes (business_id, created_at desc);
create index arpe_quotes_business_status_idx on public.arpe_quotes (business_id, status);
create index arpe_quotes_business_delivery_idx on public.arpe_quotes (business_id, delivery_date);

alter table public.arpe_quotes enable row level security;
alter table public.arpe_quote_sequences enable row level security;
revoke all on public.arpe_quotes, public.arpe_quote_sequences from anon, authenticated;
grant select, insert, update, delete on public.arpe_quotes to authenticated;

create policy arpe_quotes_select on public.arpe_quotes for select to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy arpe_quotes_insert on public.arpe_quotes for insert to authenticated
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy arpe_quotes_update on public.arpe_quotes for update to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
create policy arpe_quotes_delete on public.arpe_quotes for delete to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

create function private.next_arpe_quote_number()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare current_year integer := extract(year from now())::integer; next_value integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.arpe_businesses where id = new.business_id and owner_id = (select auth.uid())) then
    raise exception 'Business access denied';
  end if;
  if new.quote_number is null or btrim(new.quote_number) = '' then
    insert into public.arpe_quote_sequences (business_id, sequence_year, next_number)
    values (new.business_id, current_year, 2)
    on conflict (business_id, sequence_year) do update set next_number = public.arpe_quote_sequences.next_number + 1
    returning next_number - 1 into next_value;
    new.quote_number := format('ARPE-COT-%s-%s', current_year, lpad(next_value::text, 4, '0'));
  end if;
  return new;
end;
$$;
revoke all on function private.next_arpe_quote_number() from public, anon;
grant execute on function private.next_arpe_quote_number() to authenticated;
create trigger arpe_quote_number_before_insert before insert on public.arpe_quotes
for each row execute function private.next_arpe_quote_number();

create function public.arpe_quotes_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$ begin new.updated_at := now(); return new; end; $$;
revoke all on function public.arpe_quotes_updated_at() from public, anon, authenticated;
create trigger arpe_quote_updated before update on public.arpe_quotes for each row execute function public.arpe_quotes_updated_at();
