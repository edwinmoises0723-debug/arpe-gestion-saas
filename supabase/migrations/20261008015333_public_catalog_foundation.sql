begin;

alter table public.arpe_catalog_products
  add column image_path text,
  add column is_public boolean not null default false,
  add column public_price_mode text not null default 'exact',
  add column public_sort_order integer not null default 0,
  add constraint arpe_catalog_products_public_price_mode_check
    check (public_price_mode in ('exact', 'from', 'contact')),
  add constraint arpe_catalog_products_public_sort_order_check
    check (public_sort_order >= 0);

alter table public.arpe_businesses
  add column catalog_slug text,
  add column public_catalog_enabled boolean not null default false,
  add column public_catalog_show_whatsapp boolean not null default true,
  add column public_catalog_logo_path text,
  add constraint arpe_businesses_catalog_slug_check
    check (catalog_slug is null or (
      char_length(catalog_slug) between 3 and 80
      and catalog_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )),
  add constraint arpe_businesses_public_catalog_slug_required_check
    check (not public_catalog_enabled or catalog_slug is not null);

create unique index arpe_businesses_catalog_slug_unique
  on public.arpe_businesses (catalog_slug)
  where catalog_slug is not null;

grant update (catalog_slug, public_catalog_enabled, public_catalog_show_whatsapp, public_catalog_logo_path)
  on public.arpe_businesses to authenticated;

-- Keep relative marketing-media references inside the owning business namespace.
-- The trigger is SECURITY INVOKER: product ownership is also enforced by RLS, and the
-- business trigger validates against the immutable owner_id/id values on the row.
create function private.arpe_guard_catalog_media_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_parts text[];
begin
  if tg_table_schema <> 'public' then
    raise exception 'Catalog media paths are only valid on public catalog tables' using errcode = '23514';
  end if;

  if tg_table_name = 'arpe_catalog_products' then
    if new.image_path is null then return new; end if;
    select b.owner_id into v_owner_id
    from public.arpe_businesses b
    where b.id = new.business_id;
    v_parts := string_to_array(new.image_path, '/');
    if v_owner_id is null
      or cardinality(v_parts) <> 4
      or v_parts[1] <> v_owner_id::text
      or v_parts[2] <> new.business_id::text
      or v_parts[3] <> 'products'
      or btrim(v_parts[4]) = ''
      or v_parts[4] in ('.', '..') then
      raise exception 'Catalog product image path must belong to its business' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'arpe_businesses' then
    if new.public_catalog_logo_path is null then return new; end if;
    v_parts := string_to_array(new.public_catalog_logo_path, '/');
    if cardinality(v_parts) <> 4
      or v_parts[1] <> new.owner_id::text
      or v_parts[2] <> new.id::text
      or v_parts[3] <> 'profile'
      or btrim(v_parts[4]) = ''
      or v_parts[4] in ('.', '..') then
      raise exception 'Public catalog logo path must belong to its business' using errcode = '23514';
    end if;
    return new;
  end if;

  raise exception 'Catalog media path guard attached to an unsupported table' using errcode = '23514';
end;
$$;
revoke all on function private.arpe_guard_catalog_media_path() from public, anon, authenticated;

create trigger arpe_catalog_product_media_path_guard
  before insert or update on public.arpe_catalog_products
  for each row execute function private.arpe_guard_catalog_media_path();
create trigger arpe_business_catalog_logo_path_guard
  before insert or update on public.arpe_businesses
  for each row execute function private.arpe_guard_catalog_media_path();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ejnexa-catalog-media',
  'ejnexa-catalog-media',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
);

create policy "Catalog owners can upload marketing media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ejnexa-catalog-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.arpe_businesses b
      where b.id::text = (storage.foldername(objects.name))[2]
        and b.owner_id = (select auth.uid())
    )
    and (storage.foldername(name))[3] in ('products', 'profile')
    and cardinality(storage.foldername(name)) = 3
    and storage.filename(name) <> ''
  );

-- Storage's delete API also requires SELECT access to the target object.
create policy "Catalog owners can select marketing media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ejnexa-catalog-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.arpe_businesses b
      where b.id::text = (storage.foldername(objects.name))[2]
        and b.owner_id = (select auth.uid())
    )
    and (storage.foldername(name))[3] in ('products', 'profile')
    and cardinality(storage.foldername(name)) = 3
    and storage.filename(name) <> ''
  );

create policy "Catalog owners can delete marketing media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ejnexa-catalog-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.arpe_businesses b
      where b.id::text = (storage.foldername(objects.name))[2]
        and b.owner_id = (select auth.uid())
    )
    and (storage.foldername(name))[3] in ('products', 'profile')
    and cardinality(storage.foldername(name)) = 3
    and storage.filename(name) <> ''
  );

comment on column public.arpe_catalog_products.image_path is 'Relative path in the public marketing-only ejnexa-catalog-media bucket; hiding a product does not revoke a previously known media URL.';
comment on column public.arpe_businesses.public_catalog_logo_path is 'Relative path in the public marketing-only ejnexa-catalog-media bucket; never references the private business logo bucket.';

create function public.ejnexa_get_public_catalog_profile(p_slug text)
returns table (
  catalog_slug text,
  name text,
  slogan text,
  description text,
  currency text,
  public_catalog_logo_path text,
  whatsapp text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.catalog_slug, b.name, b.slogan, b.description, b.currency,
    b.public_catalog_logo_path,
    case when b.public_catalog_show_whatsapp then nullif(b.whatsapp, '') else null end
  from public.arpe_businesses b
  where b.catalog_slug = p_slug
    and b.public_catalog_enabled = true;
$$;

create function public.ejnexa_get_public_catalog_products(p_slug text)
returns table (
  id uuid,
  name text,
  category text,
  description text,
  unit_label text,
  default_unit_price numeric,
  default_portions integer,
  image_path text,
  public_price_mode text,
  public_sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.category, p.description, p.unit_label,
    case when p.public_price_mode = 'contact' then null else p.default_unit_price end,
    p.default_portions, p.image_path,
    p.public_price_mode, p.public_sort_order
  from public.arpe_catalog_products p
  join public.arpe_businesses b on b.id = p.business_id
  where b.catalog_slug = p_slug
    and b.public_catalog_enabled = true
    and p.is_active = true
    and p.is_public = true
  order by p.public_sort_order asc, p.name asc;
$$;

revoke all on function public.ejnexa_get_public_catalog_profile(text) from public, anon, authenticated;
revoke all on function public.ejnexa_get_public_catalog_products(text) from public, anon, authenticated;
grant execute on function public.ejnexa_get_public_catalog_profile(text) to anon, authenticated;
grant execute on function public.ejnexa_get_public_catalog_products(text) to anon, authenticated;

commit;
