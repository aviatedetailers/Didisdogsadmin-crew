-- Clock in / clock out + event schedule.

-- ========== Open shifts (clocked in, not out yet) ==========
alter table public.shifts alter column end_time drop not null;

-- One open shift per worker at a time
create unique index if not exists shifts_one_open_per_worker
  on public.shifts (worker_id) where end_time is null;

create or replace function public.shifts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare mins numeric;
begin
  if new.end_time is null then
    new.hours := 0;
  else
    mins := extract(epoch from (new.end_time - new.start_time)) / 60;
    if mins < 0 then mins := mins + 1440; end if;
    new.hours := round(mins / 60, 2);
  end if;

  if tg_op = 'INSERT' then
    new.rate := coalesce((select pay_rate from public.profiles where id = new.worker_id), 0);
  end if;

  if not public.is_admin() then
    if tg_op = 'INSERT' then
      new.paid := false; new.paid_at := null;
    else
      if old.paid then raise exception 'This shift was already paid'; end if;
      new.paid := old.paid; new.paid_at := old.paid_at;
      new.rate := old.rate; new.worker_id := old.worker_id;
    end if;
  else
    if new.end_time is null then new.paid := false; end if;
    if new.paid and new.paid_at is null then new.paid_at := now(); end if;
    if not new.paid then new.paid_at := null; end if;
  end if;
  return new;
end $$;

-- ========== Events ==========
create table if not exists public.events (
  id bigint generated always as identity primary key,
  title text not null,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_workers (
  event_id bigint not null references public.events(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  primary key (event_id, worker_id)
);

alter table public.shifts add column if not exists event_id bigint references public.events(id) on delete set null;

alter table public.events enable row level security;
alter table public.event_workers enable row level security;

drop policy if exists "owner or assigned sees event" on public.events;
create policy "owner or assigned sees event" on public.events
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.event_workers ew where ew.event_id = events.id and ew.worker_id = auth.uid())
  );
drop policy if exists "owner manages events" on public.events;
create policy "owner manages events" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "owner or self sees assignment" on public.event_workers;
create policy "owner or self sees assignment" on public.event_workers
  for select to authenticated using (public.is_admin() or worker_id = auth.uid());
drop policy if exists "owner manages assignments" on public.event_workers;
create policy "owner manages assignments" on public.event_workers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.events, public.event_workers from anon;
grant select, insert, update, delete on public.events, public.event_workers to authenticated;
grant usage, select on all sequences in schema public to authenticated;
