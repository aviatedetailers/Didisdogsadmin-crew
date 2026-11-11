-- Expenses back to owner only.
drop policy if exists "owner or manager manages expenses" on public.expenses;
drop policy if exists "owner manages expenses" on public.expenses;
create policy "owner manages expenses" on public.expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
