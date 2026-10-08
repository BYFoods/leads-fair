// Hourly on the hour (pg_cron, see migrations/006_affair_invite.sql). Protected by the CRON_SECRET header.
// From 19 Oct 18:00 Paris until the party starts, sends the "A Portuguese Affair" invitation to every lead
// that was ticked for it and has not received it yet. Each email goes from the mailbox of whoever scanned the lead.
import { admin, env, json, m365Ready } from '../_shared/util.ts';
import { deliverInvite } from '../_shared/mail.ts';
import { INVITE_AT, INVITE_UNTIL } from '../_shared/affair.ts';

Deno.serve(async (req) => {
  if (!env('CRON_SECRET') || req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'forbidden' }, 403);
  const report = { due: 0, sent: 0, errors: [] as string[] };
  const now = Date.now();
  if (now < INVITE_AT || now >= INVITE_UNTIL || !m365Ready()) return json({ ...report, skipped: true });

  const db = admin();
  const { data: leads } = await db.from('leads').select('*')
    .eq('invite_affair', true).is('invite_sent_at', null).neq('email', '').limit(300);
  report.due = leads?.length ?? 0;
  const owners = new Map<string, string | null>();
  for (const lead of leads ?? []) {
    try {
      if (!lead.user_id) throw new Error('lead has no owner mailbox to send from');
      if (!owners.has(lead.user_id)) {
        const { data } = await db.from('profiles').select('email').eq('id', lead.user_id).maybeSingle();
        owners.set(lead.user_id, data?.email ?? null);
      }
      const from = owners.get(lead.user_id);
      if (!from) throw new Error('owner has no email');
      await deliverInvite(lead, { email: from });
      report.sent++;
    } catch (e) {
      report.errors.push(`${lead.email}: ${(e as Error).message}`);
      await db.from('leads').update({ invite_error: (e as Error).message.slice(0, 500) }).eq('id', lead.id).is('invite_sent_at', null);
    }
  }
  console.log(JSON.stringify(report));
  return json(report);
});
