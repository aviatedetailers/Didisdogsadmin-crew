-- Paid / not paid on expenses
alter table public.expenses add column if not exists paid boolean not null default false;
