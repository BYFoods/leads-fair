-- Fair Leads v2 — hourly job: checks replies, sends reminders, retries Odoo.
-- Run ONCE, AFTER the functions are deployed and the CRON_SECRET secret is set.
-- Before running, replace the two values marked <<< >>> below.
-- First enable the extensions: Database > Extensions > enable "pg_cron" and "pg_net".

select vault.create_secret('https://<<<PROJECT_REF>>>.supabase.co', 'fair_leads_url');
select vault.create_secret('<<<SAME VALUE AS THE CRON_SECRET FUNCTION SECRET>>>', 'fair_leads_cron_secret');

select cron.unschedule('fair-leads-reminders') where exists (select 1 from cron.job where jobname = 'fair-leads-reminders');
select cron.schedule('fair-leads-reminders', '7 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'fair_leads_url') || '/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
               'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fair_leads_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);

-- To check it runs:   select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:         select cron.unschedule('fair-leads-reminders');
