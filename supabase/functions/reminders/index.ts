// Hourly job (called by pg_cron, see migrations/003_schedule.sql). Protected by the CRON_SECRET header.
// 1. Checks the sender's mailbox for replies to follow-ups sent in the last 45 days.
// 2. Sends a reminder when there is no reply after N days (each sender's own settings), weekdays 9h–18h Lisbon.
// 3. Retries Odoo for recent leads that are not synced yet.
import { admin, env, firstReply, json, m365Ready, settingsOf } from '../_shared/util.ts';
import { deliver } from '../_shared/mail.ts';
import { odooNote, odooReady, syncLead } from '../_shared/odoo.ts';

const DAY = 86_400_000;

function workingHourInLisbon(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(d);
  const wd = parts.find(p => p.type === 'weekday')?.value, h = Number(parts.find(p => p.type === 'hour')?.value);
  return !['Sat', 'Sun'].includes(wd ?? '') && h >= 9 && h < 18;
}

Deno.serve(async (req) => {
  if (!env('CRON_SECRET') || req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'forbidden' }, 403);
  const db = admin();
  const report = { checked: 0, replies: 0, reminders: 0, odoo: 0, errors: [] as string[] };

  if (m365Ready()) {
    const { data: leads } = await db.from('leads').select('*')
      .not('sent_at', 'is', null).is('replied_at', null).neq('email', '')
      .gte('sent_at', new Date(Date.now() - 45 * DAY).toISOString()).limit(300);
    const settingsCache = new Map<string, Awaited<ReturnType<typeof settingsOf>>>();
    const canRemind = workingHourInLisbon();

    for (const lead of leads ?? []) {
      const mailbox = lead.sent_from;
      if (!mailbox) continue;
      try {
        report.checked++;
        const replied = await firstReply(mailbox, lead.email, lead.sent_at);
        if (replied) {
          await db.from('leads').update({ replied_at: replied, reply_checked_at: new Date().toISOString() }).eq('id', lead.id);
          await odooNote(lead, `${lead.email} replied to the follow-up.`);
          report.replies++;
          continue;
        }
        await db.from('leads').update({ reply_checked_at: new Date().toISOString() }).eq('id', lead.id);

        if (!canRemind || !lead.auto_remind || !lead.sent_by) continue;
        if (!settingsCache.has(lead.sent_by)) settingsCache.set(lead.sent_by, await settingsOf(lead.sent_by));
        const set = settingsCache.get(lead.sent_by)!.settings ?? {};
        const days = Number(set.reminderDays ?? 5), max = Number(set.maxReminders ?? 2);
        if (!(days > 0) || (lead.reminder_count ?? 0) >= max) continue;
        const last = Date.parse(lead.last_reminder_at ?? lead.sent_at);
        if (Date.now() - last < days * DAY) continue;
        await deliver(lead, { id: lead.sent_by, email: mailbox }, 'reminder');
        report.reminders++;
      } catch (e) {
        report.errors.push(`${lead.email}: ${(e as Error).message}`);
      }
    }
  }

  if (odooReady()) {
    const { data: pending } = await db.from('leads').select('*').is('odoo_lead_id', null)
      .gte('created_at', new Date(Date.now() - 14 * DAY).toISOString()).limit(50);
    for (const lead of pending ?? []) {
      const r = await syncLead(lead);
      if (r.ok) report.odoo++; else report.errors.push(`Odoo ${lead.name}: ${r.error}`);
    }
  }
  console.log(JSON.stringify(report));
  return json(report);
});
