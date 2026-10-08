// Sends a follow-up (or a manual reminder) for a lead from the signed-in user's Microsoft 365 mailbox.
// Body: { lead_id: string, kind?: 'first' | 'reminder' | 'invite' }  ('invite' = A Portuguese Affair)
import { admin, callerOf, cors, json, m365Ready } from '../_shared/util.ts';
import { deliver, deliverInvite } from '../_shared/mail.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await callerOf(req);
  if (!user?.email) return json({ error: 'Please sign in again.' }, 401);
  if (!m365Ready()) return json({ error: 'Email sending is not set up yet.', code: 'not_configured' }, 409);
  try {
    const { lead_id, kind = 'first' } = await req.json();
    const { data: lead } = await admin().from('leads').select('*').eq('id', lead_id).maybeSingle();
    if (!lead) return json({ error: 'Lead not found' }, 404);
    const updated = kind === 'invite'
      ? await deliverInvite(lead, { email: user.email })
      : await deliver(lead, { id: user.id, email: user.email }, kind === 'reminder' ? 'reminder' : 'first');
    return json({ ok: true, lead: updated });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not send the email' }, 400);
  }
});
