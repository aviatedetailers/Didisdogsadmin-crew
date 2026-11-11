-- Per-manager switch: can see all events (view only).
alter table public.profiles add column if not exists can_see_events boolean not null default false;

create or replace function public.can_see_events() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager' and can_see_events);
$$;
revoke execute on function public.can_see_events() from public, anon;
grant execute on function public.can_see_events() to authenticated;

-- Only the owner can flip the switch
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.pay_rate := old.pay_rate;
    new.email := old.email;
    new.can_see_events := old.can_see_events;
  end if;
  if old.role = 'admin' and new.role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'There must always be at least one owner';
  end if;
  return new;
end $$;
revoke execute on function public.profiles_guard() from public, anon, authenticated;

drop policy if exists "owner or assigned sees event" on public.events;
create policy "owner or assigned sees event" on public.events
  for select to authenticated using (
    public.is_admin()
    or public.can_see_events()
    or exists (select 1 from public.event_workers ew where ew.event_id = events.id and ew.worker_id = auth.uid())
  );
