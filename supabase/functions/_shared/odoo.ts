// Odoo external API (JSON-RPC). Needs the secrets ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY.
// Creates/updates: company (res.partner), contact person (res.partner), opportunity (crm.lead).
import { admin, env, type Lead } from './util.ts';

export const odooReady = () => !!(env('ODOO_URL') && env('ODOO_DB') && env('ODOO_USER') && env('ODOO_API_KEY'));

let uid: number | null = null;
async function rpc(service: string, method: string, args: unknown[]) {
  const r = await fetch(`${env('ODOO_URL').replace(/\/+$/, '')}/jsonrpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
  });
  if (!r.ok) throw new Error(`Odoo returned ${r.status}`);
  const out = await r.json();
  if (out.error) throw new Error(`Odoo: ${out.error.data?.message ?? out.error.message}`);
  return out.result;
}
async function call(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  if (!uid) {
    uid = await rpc('common', 'authenticate', [env('ODOO_DB'), env('ODOO_USER'), env('ODOO_API_KEY'), {}]);
    if (!uid) throw new Error('Odoo login failed: check ODOO_DB, ODOO_USER and ODOO_API_KEY');
  }
  return rpc('object', 'execute_kw', [env('ODOO_DB'), uid, env('ODOO_API_KEY'), model, method, args, kwargs]);
}
async function findId(model: string, domain: unknown[]): Promise<number | null> {
  const ids = await call(model, 'search', [domain], { limit: 1 });
  return ids?.[0] ?? null;
}
const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

// Creates the lead in Odoo, or updates it if it was synced before. Saves the Odoo ids on the lead.
export async function syncLead(lead: Lead) {
  const db = admin();
  try {
    const countryId = lead.country ? await findId('res.country', [['name', '=ilike', lead.country]]) : null;
    const { data: owner } = lead.user_id
      ? await db.from('profiles').select('email, full_name').eq('id', lead.user_id).maybeSingle()
      : { data: null };
    const salesId = owner?.email ? await findId('res.users', [['login', '=ilike', owner.email]]) : null;

    // Company
    let companyId: number | null = null;
    if (lead.company) {
      companyId = await findId('res.partner', [['is_company', '=', true], ['name', '=ilike', lead.company]]);
      if (!companyId) companyId = await call('res.partner', 'create', [{
        name: lead.company, is_company: true, website: lead.website || false, country_id: countryId || false,
      }]);
    }
    // Contact person (re-uses an existing contact with the same email)
    const person: Record<string, unknown> = {
      name: lead.name, parent_id: companyId || false, email: lead.email || false, phone: lead.phone || false,
      function: lead.title || false, website: lead.website || false, street: lead.address || false, country_id: countryId || false,
    };
    let partnerId: number | null = lead.odoo_partner_id
      ?? (lead.email ? await findId('res.partner', [['email', '=ilike', lead.email], ['is_company', '=', false]]) : null);
    if (partnerId) await call('res.partner', 'write', [[partnerId], person]);
    else partnerId = await call('res.partner', 'create', [person]);

    // Fair as a tag, so every contact from one fair can be filtered in the pipeline
    let tagIds: number[] = [];
    if (lead.event) {
      let tag = await findId('crm.tag', [['name', '=ilike', lead.event]]);
      if (!tag) tag = await call('crm.tag', 'create', [{ name: lead.event }]);
      tagIds = [tag!];
    }
    const note = [
      lead.event && `Met at: ${lead.event}`,
      lead.source && lead.source !== 'manual' && `Captured from: ${lead.source === 'qr' ? 'QR e-contact' : lead.source}`,
      owner && `Scanned by: ${owner.full_name || owner.email}`,
      lead.notes && `Notes: ${lead.notes}`,
    ].filter(Boolean).map(l => `<p>${esc(String(l))}</p>`).join('');
    const opp: Record<string, unknown> = {
      name: [lead.company || lead.name, lead.event].filter(Boolean).join(' – '),
      type: 'opportunity', partner_id: partnerId, contact_name: lead.name, partner_name: lead.company || false,
      email_from: lead.email || false, phone: lead.phone || false, function: lead.title || false,
      website: lead.website || false, street: lead.address || false, country_id: countryId || false,
      description: note || false, ...(salesId ? { user_id: salesId } : {}),
      ...(tagIds.length ? { tag_ids: [[6, 0, tagIds]] } : {}),
    };
    let oppId: number | null = lead.odoo_lead_id ?? null;
    if (oppId) await call('crm.lead', 'write', [[oppId], opp]);
    else oppId = await call('crm.lead', 'create', [opp]);

    const saved = { odoo_partner_id: partnerId, odoo_lead_id: oppId, odoo_synced_at: new Date().toISOString(), odoo_error: null };
    await db.from('leads').update(saved).eq('id', lead.id);
    return { ok: true, ...saved };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('leads').update({ odoo_error: msg.slice(0, 500) }).eq('id', lead.id);
    return { ok: false, error: msg };
  }
}

// Adds a note to the opportunity's history (best effort: never breaks the caller).
export async function odooNote(lead: Lead, text: string) {
  if (!odooReady() || !lead.odoo_lead_id) return;
  try {
    await call('crm.lead', 'message_post', [[lead.odoo_lead_id]], { body: esc(text), message_type: 'comment', subtype_xmlid: 'mail.mt_note' });
  } catch { /* ignore */ }
}
