-- Send every event change to the Google Apps Script web app (instant calendar sync).
create extension if not exists pg_net;

-- Private settings (nobody can read these through the app)
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
-- Set these once (values are not stored in this file):
--   insert into public.app_settings values ('gcal_secret', '...'), ('gcal_url', 'https://script.google.com/macros/s/.../exec')
--   on conflict (key) do update set value = excluded.value;

create or replace function public.events_to_gcal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u text := (select value from public.app_settings where key = 'gcal_url');
  s text := (select value from public.app_settings where key = 'gcal_secret');
  r public.events;
begin
  if u is null or s is null then return null; end if;
  if tg_op = 'DELETE' then
    perform net.http_post(url := u, body := jsonb_build_object('secret', s, 'action', 'delete', 'id', old.id),
      timeout_milliseconds := 30000);
    return null;
  end if;
  r := new;
  perform net.http_post(url := u, body := jsonb_build_object(
    'secret', s, 'action', 'upsert', 'id', r.id, 'title', r.title,
    'date', r.event_date::text, 'start', r.start_time::text, 'end', r.end_time::text,
    'location', r.location, 'notes', r.notes),
    timeout_milliseconds := 30000);
  return null;
end $$;
revoke execute on function public.events_to_gcal() from public, anon, authenticated;

drop trigger if exists events_to_gcal on public.events;
create trigger events_to_gcal after insert or update or delete on public.events
  for each row execute function public.events_to_gcal();
