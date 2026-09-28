-- Fair Leads v2.2 — run once (safe to run twice). A single "current fair" shared by the whole team:
-- whoever sets it, every new lead from any team member is tagged with it automatically until changed.
create table if not exists public.team_settings (
  id           int primary key default 1 check (id = 1), -- one row only
  current_event text not null default '',
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);
insert into public.team_settings (id) values (1) on conflict (id) do nothing;

alter table public.team_settings enable row level security;
drop policy if exists "team reads fair" on public.team_settings;
drop policy if exists "team sets fair" on public.team_settings;
create policy "team reads fair" on public.team_settings for select to authenticated using (true);
create policy "team sets fair"  on public.team_settings for update to authenticated using (true) with check (id = 1);
