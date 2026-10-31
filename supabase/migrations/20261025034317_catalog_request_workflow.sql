begin;

create function public.ejnexa_mark_catalog_request_reviewing(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Request unavailable or transition not allowed';
  end if;

  update public.arpe_catalog_requests r
  set status = 'reviewing', reviewed_at = coalesce(r.reviewed_at, now())
  from public.arpe_businesses b
  where r.id = p_request_id
    and r.business_id = b.id
    and b.owner_id = (select auth.uid())
    and r.status = 'new'
  returning r.status into v_status;

  if not found then
    raise exception 'Request unavailable or transition not allowed';
  end if;

  return v_status;
end;
$$;

create function public.ejnexa_decline_catalog_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Request unavailable or transition not allowed';
  end if;

  update public.arpe_catalog_requests r
  set status = 'declined', reviewed_at = coalesce(r.reviewed_at, now())
  from public.arpe_businesses b
  where r.id = p_request_id
    and r.business_id = b.id
    and b.owner_id = (select auth.uid())
    and r.status in ('new', 'reviewing')
  returning r.status into v_status;

  if not found then
    raise exception 'Request unavailable or transition not allowed';
  end if;

  return v_status;
end;
$$;

create function public.ejnexa_archive_catalog_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Request unavailable or transition not allowed';
  end if;

  update public.arpe_catalog_requests r
  set status = 'archived'
  from public.arpe_businesses b
  where r.id = p_request_id
    and r.business_id = b.id
    and b.owner_id = (select auth.uid())
    and r.status in ('new', 'reviewing', 'declined')
  returning r.status into v_status;

  if not found then
    raise exception 'Request unavailable or transition not allowed';
  end if;

  return v_status;
end;
$$;

revoke all on function public.ejnexa_mark_catalog_request_reviewing(uuid)
  from public, anon, authenticated;
revoke all on function public.ejnexa_decline_catalog_request(uuid)
  from public, anon, authenticated;
revoke all on function public.ejnexa_archive_catalog_request(uuid)
  from public, anon, authenticated;

grant execute on function public.ejnexa_mark_catalog_request_reviewing(uuid) to authenticated;
grant execute on function public.ejnexa_decline_catalog_request(uuid) to authenticated;
grant execute on function public.ejnexa_archive_catalog_request(uuid) to authenticated;

commit;
