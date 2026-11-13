-- Optional label shown next to a name (e.g. "Site Operator"). Only owners can change it.
alter table public.profiles add column if not exists title text;
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.pay_rate := old.pay_rate;
    new.email := old.email;
    new.can_see_events := old.can_see_events;
    new.title := old.title;
  end if;
  if old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'There must always be at least one owner';
  end if;
  return new;
end $$;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
