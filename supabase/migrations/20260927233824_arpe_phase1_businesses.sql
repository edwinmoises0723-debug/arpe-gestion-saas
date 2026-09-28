-- Phase 1 is isolated from pre-existing ARPE tables. No data is imported or overwritten.
create table public.arpe_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  logo_path text,
  slogan text not null default '' check (char_length(slogan) <= 160),
  description text not null default '' check (char_length(description) <= 1000),
  whatsapp text not null default '' check (char_length(whatsapp) <= 30),
  email text not null default '' check (char_length(email) <= 254),
  address text not null default '' check (char_length(address) <= 500),
  currency text not null default 'NIO' check (currency in ('NIO', 'USD', 'EUR', 'CRC')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arpe_one_business_per_owner unique(owner_id),
  constraint arpe_logo_owner_folder check (logo_path is null or split_part(logo_path, '/', 1) = owner_id::text)
);

alter table public.arpe_businesses enable row level security;
revoke all on public.arpe_businesses from anon, authenticated;
grant select on public.arpe_businesses to authenticated;
grant insert (owner_id, name, logo_path, slogan, description, whatsapp, email, address, currency) on public.arpe_businesses to authenticated;
grant update (name, logo_path, slogan, description, whatsapp, email, address, currency) on public.arpe_businesses to authenticated;

create policy arpe_business_select on public.arpe_businesses for select to authenticated
using ((select auth.uid()) = owner_id);
create policy arpe_business_insert on public.arpe_businesses for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy arpe_business_update on public.arpe_businesses for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- No DELETE grant or policy: deleting a business is outside Phase 1.

create function public.arpe_set_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.arpe_set_updated_at() from public, anon, authenticated;
create trigger arpe_business_updated before update on public.arpe_businesses
for each row execute function public.arpe_set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arpe-business-logos', 'arpe-business-logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']);

create policy arpe_logo_select on storage.objects for select to authenticated
using (bucket_id = 'arpe-business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy arpe_logo_insert on storage.objects for insert to authenticated
with check (bucket_id = 'arpe-business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy arpe_logo_delete on storage.objects for delete to authenticated
using (bucket_id = 'arpe-business-logos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Logos get unique paths. No overwrite policy is necessary; replacement uploads a new file.
