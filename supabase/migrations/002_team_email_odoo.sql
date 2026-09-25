-- Fair Leads v2 — run ONCE in Supabase: SQL Editor > New query > paste > Run
-- This migration only ADDS things. It never deletes or rewrites an existing lead or setting.
-- Safe to run twice (every step checks whether it was already done).
-- Tip: before running, take a backup: Table Editor > leads > Export to CSV.

-- 1. New columns on leads -------------------------------------------------------------
alter table public.leads
  add column if not exists title            text not null default '',
  add column if not exists website          text not null default '',
  add column if not exists address          text not null default '',
  add column if not exists notes            text not null default '',
  add column if not exists event            text not null default '',
  -- follow-up email tracking
  add column if not exists track_token      uuid not null default gen_random_uuid(),
  add column if not exists sent_by          uuid references auth.users(id) on delete set null,
  add column if not exists sent_from        text,
  add column if not exists sent_subject     text,
  add column if not exists sent_link        text,
  add column if not exists open_count       int  not null default 0,
  add column if not exists opened_at        timestamptz,
  add column if not exists last_opened_at   timestamptz,
  add column if not exists click_count      int  not null default 0,
  add column if not exists clicked_at       timestamptz,
  add column if not exists replied_at       timestamptz,
  add column if not exists reply_checked_at timestamptz,
  add column if not exists reminder_count   int  not null default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists auto_remind      boolean not null default true,
  add column if not exists email_error      text,
  -- Odoo
  add column if not exists odoo_partner_id  int,
  add column if not exists odoo_lead_id     int,
  add column if not exists odoo_synced_at   timestamptz,
  add column if not exists odoo_error       text;
create unique index if not exists leads_track_token on public.leads (track_token);
create index if not exists leads_created on public.leads (created_at desc);

-- 2. Portuguese as a follow-up language -----------------------------------------------
alter table public.leads drop constraint if exists leads_lang_check;
alter table public.leads add constraint leads_lang_check check (lang in ('en','fr','es','de','pt'));

-- 3. Removing a user must NEVER delete the leads they scanned (was: on delete cascade) --
alter table public.leads alter column user_id drop not null;
alter table public.leads drop constraint if exists leads_user_id_fkey;
alter table public.leads add constraint leads_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 4. Team profiles (to show who scanned each lead) ------------------------------------
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  full_name text not null default ''
);
insert into public.profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
drop policy if exists "team reads profiles" on public.profiles;
drop policy if exists "own profile" on public.profiles;
create policy "team reads profiles" on public.profiles for select to authenticated using (true);
create policy "own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 5. Team sharing: every signed-in user sees and edits all leads; only the owner deletes.
--    IMPORTANT: turn OFF public sign-ups (Authentication > Sign In / Providers > "Allow new users to sign up").
drop policy if exists "own leads" on public.leads;
drop policy if exists "team reads leads" on public.leads;
drop policy if exists "team adds leads" on public.leads;
drop policy if exists "team edits leads" on public.leads;
drop policy if exists "owner deletes leads" on public.leads;
create policy "team reads leads"    on public.leads for select to authenticated using (true);
create policy "team adds leads"     on public.leads for insert to authenticated with check (user_id = (select auth.uid()));
create policy "team edits leads"    on public.leads for update to authenticated using (true) with check (true);
create policy "owner deletes leads" on public.leads for delete to authenticated using (user_id = (select auth.uid()));
-- app_settings keeps its "own settings" policy: each person has their own templates and signature.

-- 6. Open / click tracking (called only by the server) --------------------------------
-- Events in the first minute after sending are ignored: those are usually mail scanners, not people.
create or replace function public.track_email_event(p_token uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_link text;
begin
  if p_kind = 'open' then
    update public.leads
       set open_count = open_count + 1, opened_at = coalesce(opened_at, now()), last_opened_at = now()
     where track_token = p_token and sent_at is not null
       and now() - greatest(sent_at, coalesce(last_reminder_at, sent_at)) > interval '1 minute';
  elsif p_kind = 'click' then
    update public.leads
       set click_count = click_count + 1, clicked_at = coalesce(clicked_at, now()),
           opened_at = coalesce(opened_at, now()), last_opened_at = now()
     where track_token = p_token and sent_at is not null
       and now() - greatest(sent_at, coalesce(last_reminder_at, sent_at)) > interval '1 minute';
  end if;
  select sent_link into v_link from public.leads where track_token = p_token;
  return v_link;
end $$;
revoke execute on function public.track_email_event(uuid, text) from public, anon, authenticated;
