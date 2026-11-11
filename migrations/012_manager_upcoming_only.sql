-- Managers with the events switch see and edit upcoming events only.
create or replace function public.can_see_events() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager' and can_see_events);
$$;
drop policy if exists "owner or assigned sees event" on public.events;
create policy "owner or assigned sees event" on public.events
  for select to authenticated using (
    public.is_admin()
    or (public.can_see_events() and event_date >= current_date)
    or exists (select 1 from public.event_workers ew where ew.event_id = events.id and ew.worker_id = auth.uid())
  );
drop policy if exists "events manager edits" on public.events;
create policy "events manager edits" on public.events
  for update to authenticated using (public.can_see_events() and event_date >= current_date)
  with check (public.can_see_events());
