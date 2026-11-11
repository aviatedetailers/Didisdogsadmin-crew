-- Managers with the events switch can also add and edit events (not delete, not assign workers).
drop policy if exists "events manager adds" on public.events;
create policy "events manager adds" on public.events
  for insert to authenticated with check (public.can_see_events());
drop policy if exists "events manager edits" on public.events;
create policy "events manager edits" on public.events
  for update to authenticated using (public.can_see_events()) with check (public.can_see_events());
