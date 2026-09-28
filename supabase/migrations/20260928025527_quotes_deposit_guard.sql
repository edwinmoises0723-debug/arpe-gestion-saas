create function private.validate_arpe_quote_deposit()
returns trigger language plpgsql security invoker set search_path = public, private as $$
begin
  if new.deposit_value < 0 then raise exception 'Deposit cannot be negative'; end if;
  if new.deposit_type = 'percentage' and new.deposit_value > 100 then raise exception 'Percentage deposit cannot exceed 100'; end if;
  if new.deposit_type = 'fixed' and new.deposit_value > new.total_amount then raise exception 'Deposit cannot exceed total amount'; end if;
  new.deposit_required := case when new.deposit_type = 'percentage' then new.total_amount * new.deposit_value / 100 else new.deposit_value end;
  return new;
end;
$$;
revoke all on function private.validate_arpe_quote_deposit() from public, anon, authenticated;
create trigger arpe_quote_deposit_guard before insert or update on public.arpe_quotes
for each row execute function private.validate_arpe_quote_deposit();
