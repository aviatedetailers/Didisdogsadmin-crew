-- Manager: own hours + full inventory + all expenses (can edit both).
-- Cannot see other workers' hours or pay, and cannot change anyone's access.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','manager','crew','pending','removed'));

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager');
$$;

create or replace function public.is_worker() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager','crew'));
$$;

revoke execute on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

drop policy if exists "owner manages inventory" on public.inventory_items;
drop policy if exists "owner or manager manages inventory" on public.inventory_items;
create policy "owner or manager manages inventory" on public.inventory_items
  for all to authenticated using (public.is_admin() or public.is_manager())
  with check (public.is_admin() or public.is_manager());

drop policy if exists "owner manages expenses" on public.expenses;
drop policy if exists "owner or manager manages expenses" on public.expenses;
create policy "owner or manager manages expenses" on public.expenses
  for all to authenticated using (public.is_admin() or public.is_manager())
  with check (public.is_admin() or public.is_manager());
