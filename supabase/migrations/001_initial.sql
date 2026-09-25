-- ORIGINAL schema (already applied in production). Kept for reference only. DO NOT run again.

create table public.leads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  company    text not null default '',
  title      text not null default '',
  email      text not null default '',
  phone      text not null default '',
  country    text not null default '',
  lang       text not null default 'en' check (lang in ('en','fr','es','de')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index leads_user_created on public.leads (user_id, created_at desc);

create table public.app_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data    jsonb not null default '{}'
);

alter table public.leads enable row level security;
alter table public.app_settings enable row level security;

create policy "own leads" on public.leads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own settings" on public.app_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
