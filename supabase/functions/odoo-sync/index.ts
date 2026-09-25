// Creates (or updates) a lead in Odoo: company + contact + CRM opportunity. Body: { lead_id }
import { admin, callerOf, cors, json } from '../_shared/util.ts';
import { odooReady, syncLead } from '../_shared/odoo.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await callerOf(req))) return json({ error: 'Please sign in again.' }, 401);
  if (!odooReady()) return json({ error: 'Odoo is not set up yet.', code: 'not_configured' }, 409);
  const { lead_id } = await req.json().catch(() => ({}));
  const { data: lead } = await admin().from('leads').select('*').eq('id', lead_id).maybeSingle();
  if (!lead) return json({ error: 'Lead not found' }, 404);
  const r = await syncLead(lead);
  return json(r, r.ok ? 200 : 502);
});
