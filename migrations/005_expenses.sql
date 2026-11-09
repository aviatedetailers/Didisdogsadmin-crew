-- Expenses (owner only)
create table if not exists public.expenses (
  id bigint generated always as identity primary key,
  spent_on date not null default current_date,
  amount numeric(10,2) not null check (amount >= 0),
  category text not null default 'Other',
  description text,
  event_id bigint references public.events(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
drop policy if exists "owner manages expenses" on public.expenses;
create policy "owner manages expenses" on public.expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;
grant usage, select on all sequences in schema public to authenticated;
