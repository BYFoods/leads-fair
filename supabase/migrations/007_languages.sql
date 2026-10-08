-- Fair Leads v2.4 — follow-up languages are now English, Italian, Spanish, Portuguese. Run once (safe to run twice).
-- Existing leads that were saved as French or German keep their value (nothing is rewritten);
-- the app only offers the four new languages from now on.
alter table public.leads drop constraint if exists leads_lang_check;
alter table public.leads add constraint leads_lang_check check (lang in ('en','it','es','pt','fr','de'));
