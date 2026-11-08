-- Worker's Zelle phone or email (owner or the worker can set it)
alter table public.profiles add column if not exists zelle text;
