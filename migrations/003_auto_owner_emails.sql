-- Emails that become owner automatically when they sign up.
-- To add another owner later: insert into public.owner_emails (email) values ('someone@example.com');
create table if not exists public.owner_emails (
  email text primary key
);
alter table public.owner_emails enable row level security;
revoke all on public.owner_emails from anon, authenticated;

insert into public.owner_emails (email) values ('didisdogsbyromanian@gmail.com')
on conflict do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    case
      when exists (select 1 from public.owner_emails o where o.email = lower(new.email)) then 'admin'
      when exists (select 1 from public.profiles where role = 'admin') then 'pending'
      else 'admin'
    end
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

update public.profiles set role = 'admin'
where lower(email) in (select email from public.owner_emails) and role <> 'admin';
