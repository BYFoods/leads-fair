-- Fair Leads v2.1 — run once (safe to run twice). Records how each lead was captured.
alter table public.leads add column if not exists source text not null default 'manual'; -- manual | card | badge | qr
