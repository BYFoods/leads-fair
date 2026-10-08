-- Fair Leads v2.3 — "A Portuguese Affair" invitation. Run once (safe to run twice). Only ADDS things.
alter table public.leads
  add column if not exists invite_affair  boolean not null default false, -- ticked on the lead form
  add column if not exists invite_sent_at timestamptz,
  add column if not exists invite_from    text,
  add column if not exists invite_error   text;

-- Hourly job, on the hour: 16:00 UTC on 19 Oct = 18:00 in Paris. Reuses the secrets created by 003_schedule.sql.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fair-leads-reminders') then
    perform cron.unschedule('fair-leads-invites') where exists (select 1 from cron.job where jobname = 'fair-leads-invites');
    perform cron.schedule('fair-leads-invites', '0 * * * *', $job$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'fair_leads_url') || '/functions/v1/invites',
        headers := jsonb_build_object('Content-Type', 'application/json',
                   'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fair_leads_cron_secret')),
        body    := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$);
  else
    raise notice 'Run 003_schedule.sql first, then run this file again to create the invitation job.';
  end if;
end $$;
-- To stop it after the event:  select cron.unschedule('fair-leads-invites');
