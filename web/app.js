'use strict';
const LANGS = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', pt: 'Português' };
const COUNTRIES = {
  'France': 'fr', 'Belgium': 'fr', 'Switzerland': 'de', 'Luxembourg': 'fr', 'Canada': 'en', 'Monaco': 'fr',
  'Germany': 'de', 'Austria': 'de', 'Spain': 'es', 'Mexico': 'es', 'Argentina': 'es', 'Colombia': 'es', 'Chile': 'es', 'Peru': 'es',
  'Portugal': 'pt', 'Brazil': 'pt', 'Angola': 'pt', 'Mozambique': 'pt', 'Cape Verde': 'pt',
  'United Kingdom': 'en', 'United States': 'en', 'Ireland': 'en', 'Australia': 'en', 'South Africa': 'en', 'Nigeria': 'en',
  'Italy': 'en', 'Netherlands': 'en', 'Poland': 'en', 'Sweden': 'en', 'Denmark': 'en', 'Norway': 'en', 'Finland': 'en', 'Greece': 'en',
  'Morocco': 'fr', 'Tunisia': 'fr', 'Algeria': 'fr', 'Senegal': 'fr', 'Ivory Coast': 'fr', 'Cameroon': 'fr',
  'United Arab Emirates': 'en', 'Saudi Arabia': 'en', 'Qatar': 'en', 'Kuwait': 'en', 'Oman': 'en', 'Bahrain': 'en', 'Egypt': 'en',
  'Jordan': 'en', 'Lebanon': 'fr', 'Turkey': 'en', 'India': 'en', 'Pakistan': 'en', 'China': 'en', 'Japan': 'en', 'South Korea': 'en',
  'Singapore': 'en', 'Malaysia': 'en', 'Indonesia': 'en', 'Thailand': 'en', 'Vietnam': 'en', 'Philippines': 'en'
};
const DEFAULT_TEMPLATES = {
  en: { subject: 'Great meeting you at {{event}}',
    body: 'Hello {{name}},\n\nIt was a pleasure meeting you at {{event}}. Thank you for your interest in {{my_company}}.\n\nAs promised, here is our digital brochure:\n{{brochure_link}}\n\nI would be glad to answer any questions or arrange a call.\n\nBest regards,\n{{sender}}' },
  fr: { subject: 'Ravi de vous avoir rencontré à {{event}}',
    body: 'Bonjour {{name}},\n\nJ\'ai été ravi de faire votre connaissance à {{event}}. Merci de l\'intérêt que vous portez à {{my_company}}.\n\nComme convenu, voici notre brochure numérique :\n{{brochure_link}}\n\nJe reste à votre disposition pour toute question ou pour organiser un appel.\n\nCordialement,\n{{sender}}' },
  es: { subject: 'Un placer conocerle en {{event}}',
    body: 'Hola {{name}}:\n\nFue un placer conocerle en {{event}}. Gracias por su interés en {{my_company}}.\n\nTal como acordamos, aquí tiene nuestro catálogo digital:\n{{brochure_link}}\n\nQuedo a su disposición para resolver cualquier duda o concertar una llamada.\n\nUn cordial saludo,\n{{sender}}' },
  de: { subject: 'Schön, Sie auf der {{event}} getroffen zu haben',
    body: 'Guten Tag {{name}},\n\nes hat mich sehr gefreut, Sie auf der {{event}} kennenzulernen. Vielen Dank für Ihr Interesse an {{my_company}}.\n\nWie besprochen, finden Sie hier unsere digitale Broschüre:\n{{brochure_link}}\n\nGerne beantworte ich Ihre Fragen oder vereinbare ein Gespräch.\n\nMit freundlichen Grüßen\n{{sender}}' },
  pt: { subject: 'Foi um prazer conhecê-lo na {{event}}',
    body: 'Olá {{name}},\n\nFoi um prazer conhecê-lo na {{event}}. Obrigado pelo interesse na {{my_company}}.\n\nComo combinado, segue a nossa brochura digital:\n{{brochure_link}}\n\nFico ao dispor para qualquer questão ou para marcarmos uma chamada.\n\nCom os melhores cumprimentos,\n{{sender}}' }
};
const DEFAULT_REMINDERS = {
  en: { subject: 'Following up',
    body: 'Hello {{name}},\n\nI just wanted to follow up on my previous email after {{event}}. In case you missed it, here is our brochure again:\n{{brochure_link}}\n\nWould you have a few minutes for a short call in the coming days?\n\nBest regards,\n{{sender}}' },
  fr: { subject: 'Suite à notre rencontre',
    body: 'Bonjour {{name}},\n\nJe me permets de revenir vers vous suite à mon précédent message après {{event}}. Voici à nouveau notre brochure :\n{{brochure_link}}\n\nAuriez-vous quelques minutes pour un court échange dans les prochains jours ?\n\nCordialement,\n{{sender}}' },
  es: { subject: 'Seguimiento',
    body: 'Hola {{name}}:\n\nLe escribo para dar seguimiento a mi mensaje anterior tras {{event}}. Por si no lo vio, aquí tiene de nuevo nuestro catálogo:\n{{brochure_link}}\n\n¿Tendría unos minutos para una breve llamada en los próximos días?\n\nUn cordial saludo,\n{{sender}}' },
  de: { subject: 'Kurze Nachfrage',
    body: 'Guten Tag {{name}},\n\nich wollte kurz an meine letzte E-Mail nach der {{event}} anknüpfen. Hier noch einmal unsere Broschüre:\n{{brochure_link}}\n\nHätten Sie in den nächsten Tagen Zeit für ein kurzes Gespräch?\n\nMit freundlichen Grüßen\n{{sender}}' },
  pt: { subject: 'Seguimento',
    body: 'Olá {{name}},\n\nVenho dar seguimento ao meu email anterior após a {{event}}. Caso não o tenha visto, segue novamente a nossa brochura:\n{{brochure_link}}\n\nTeria alguns minutos para uma breve chamada nos próximos dias?\n\nCom os melhores cumprimentos,\n{{sender}}' }
};
const DEFAULT_SETTINGS = { link: '', sender: '', company: 'BY Foods', event: '', reminderDays: 5, maxReminders: 2, mailTarget: 'outlook' };

const $ = s => document.querySelector(s);
const configured = /^https:\/\/.+\.supabase\.co/.test(CONFIG.SUPABASE_URL) && !CONFIG.SUPABASE_ANON_KEY.includes('YOUR');
const sb = configured ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
if (!configured) $('#login-msg').textContent = 'Add your Supabase URL and key to config.js, then redeploy.';
let leads = [], people = {}, me = null, started = false, editId = null, toastTimer;
let store = { templates: structuredClone(DEFAULT_TEMPLATES), reminders: structuredClone(DEFAULT_REMINDERS), settings: { ...DEFAULT_SETTINGS } };
let tplKind = 'templates', tplLang = 'en';
const settings = () => store.settings;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => new Date(t).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
async function run(query, msg) { // returns null (and shows the reason) when Supabase reports an error
  const { data, error } = await query;
  if (error) { toast(`${msg}: ${error.message}`); return null; }
  return data ?? true;
}
async function callFn(name, body) { // edge function call; returns { data } or { error, code }
  const { data, error } = await sb.functions.invoke(name, { body });
  if (!error) return { data };
  let info = {};
  try { info = await error.context.json(); } catch { /* network error */ }
  return { error: info.error || error.message || 'Something went wrong', code: info.code };
}

/* ---------- Data ---------- */
async function loadLeads() {
  let all = [], from = 0;
  for (;;) { // Supabase returns at most 1000 rows per request
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).range(from, from + 999);
    if (error) { toast('Could not load leads: ' + error.message); return; }
    all = all.concat(data); if (data.length < 1000) break; from += 1000;
  }
  leads = all; render();
}
async function loadPeople() {
  const { data } = await sb.from('profiles').select('id, email, full_name');
  people = Object.fromEntries((data || []).map(p => [p.id, p]));
}
const personName = id => { const p = people[id]; return p ? (p.full_name || p.email.split('@')[0]) : '—'; };
async function loadSettings() {
  const { data } = await sb.from('app_settings').select('data').maybeSingle();
  const saved = (data && data.data) || {};
  store = {
    templates: Object.assign(structuredClone(DEFAULT_TEMPLATES), saved.templates),
    reminders: Object.assign(structuredClone(DEFAULT_REMINDERS), saved.reminders),
    settings: Object.assign({ ...DEFAULT_SETTINGS }, saved.settings),
  };
  if (!settings().sender && people[me.id]?.full_name) settings().sender = people[me.id].full_name;
  // The server sends from the saved templates, so make sure every language is stored.
  const missing = !saved.templates || !saved.reminders || Object.keys(LANGS).some(k => !saved.templates[k] || !saved.reminders[k]);
  if (missing) await saveSettings();
}
const saveSettings = () => run(sb.from('app_settings').upsert({ user_id: me.id, data: store }), 'Could not save settings');

/* ---------- Form ---------- */
const langOptions = extra => (extra || '') + Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
$('#f-lang').innerHTML = langOptions();
$('#filter').innerHTML = langOptions('<option value="">All languages</option>');
$('#countries').innerHTML = Object.keys(COUNTRIES).map(c => `<option value="${c}">`).join('');
function langFor(country) {
  const match = Object.keys(COUNTRIES).find(c => c.toLowerCase() === String(country).trim().toLowerCase());
  return match ? COUNTRIES[match] : null;
}
$('#f-country').addEventListener('input', e => { const l = langFor(e.target.value); if (l) $('#f-lang').value = l; });
const FIELDS = ['name', 'company', 'title', 'email', 'phone', 'website', 'address', 'country', 'notes', 'event'];

$('#lead-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(FIELDS.map(k => [k, $('#f-' + k).value.trim()]));
  data.lang = $('#f-lang').value;
  if (!editId) data.source = leadSource;
  const wantsSend = !editId && $('#f-send').checked && data.email;
  const btn = $('#f-submit'); btn.disabled = true;
  const saved = editId
    ? await run(sb.from('leads').update(data).eq('id', editId).select().single(), 'Could not update lead')
    : await run(sb.from('leads').insert(data).select().single(), 'Could not save lead');
  btn.disabled = false;
  if (!saved) return; // keep the form filled so nothing is lost
  if (data.event && data.event !== settings().event && !editId) { settings().event = data.event; saveSettings(); }
  toast(editId ? 'Lead updated' : 'Lead saved');
  resetForm(); await loadLeads();
  syncOdoo(saved.id, true);
  if (wantsSend) await sendEmail(leads.find(l => l.id === saved.id) || saved, 'first', true);
});
function resetForm() {
  editId = null; $('#lead-form').reset(); $('#f-lang').value = 'en';
  $('#f-event').value = settings().event || ''; $('#f-send').checked = true; $('#send-row').hidden = false;
  document.querySelectorAll('#lead-form [data-auto], #lead-form [data-qr]').forEach(el => { delete el.dataset.auto; delete el.dataset.qr; });
  leadSource = 'manual'; scanCodes = []; scans = []; $('#scan-box').classList.add('hidden'); $('#btn-back').classList.add('hidden'); $('#scan-thumbs').innerHTML = '';
  $('#form-title').textContent = 'Add a lead'; $('#f-submit').textContent = 'Save lead'; $('#f-cancel').classList.add('hidden');
}
$('#f-cancel').addEventListener('click', resetForm);

/* ---------- Status of the follow-up ---------- */
function status(l) {
  if (l.replied_at) return { key: 'replied', label: 'Replied', cls: 'st-ok', tip: `Replied ${fmt(l.replied_at)}` };
  if (l.email_error) return { key: 'error', label: 'Not sent', cls: 'st-err', tip: l.email_error };
  if (!l.sent_at) return { key: 'unsent', label: 'Not sent', cls: 'st-none', tip: l.email ? 'No follow-up sent yet' : 'No email address' };
  const tip = [`Sent ${fmt(l.sent_at)} by ${l.sent_from || personName(l.sent_by)}`,
    l.reminder_count ? `${l.reminder_count} reminder(s), last ${fmt(l.last_reminder_at)}` : '',
    l.open_count ? `Opened ${l.open_count}×, last ${fmt(l.last_opened_at)}` : 'Not opened yet',
    l.click_count ? `Brochure opened ${l.click_count}×` : '',
    'Opens are approximate: some mail apps block or pre-load images.'].filter(Boolean).join('\n');
  const extra = l.reminder_count ? ` · ${l.reminder_count} reminder${l.reminder_count > 1 ? 's' : ''}` : '';
  if (l.click_count) return { key: 'opened', label: 'Brochure opened' + extra, cls: 'st-hot', tip };
  if (l.open_count) return { key: 'opened', label: `Opened ×${l.open_count}` + extra, cls: 'st-warm', tip };
  return { key: 'waiting', label: 'Sent' + extra, cls: 'st-sent', tip };
}
function odooBadge(l) {
  if (l.odoo_lead_id) {
    const url = CONFIG.ODOO_URL ? `${CONFIG.ODOO_URL.replace(/\/+$/, '')}/odoo/crm/${l.odoo_lead_id}` : null;
    return url ? `<a class="odoo ok" href="${esc(url)}" target="_blank" rel="noopener">Odoo ✓</a>` : '<span class="odoo ok">Odoo ✓</span>';
  }
  if (l.odoo_error) return `<button class="odoo err" data-act="odoo" data-id="${l.id}" title="${esc(l.odoo_error)}">Odoo ✗ retry</button>`;
  return '';
}

/* ---------- List ---------- */
function filtered() {
  const q = $('#search').value.trim().toLowerCase(), lang = $('#filter').value, own = $('#f-owner').value, st = $('#f-status').value;
  return leads.filter(l => (!lang || l.lang === lang) && (!own || l.user_id === me.id) && (!st || status(l).key === st)
    && [l.name, l.company, l.title, l.email, l.phone, l.country, l.event, l.notes, personName(l.user_id)].join(' ').toLowerCase().includes(q));
}
function render() {
  const rows = filtered();
  const n = f => rows.filter(f).length;
  const stat = (v, label) => `<div class="stat"><strong>${v}</strong><span>${label}</span></div>`;
  $('#stats').innerHTML = stat(rows.length, 'leads') + stat(n(l => l.sent_at), 'emailed') + stat(n(l => l.open_count || l.click_count), 'opened')
    + stat(n(l => l.click_count), 'brochure opened') + stat(n(l => l.replied_at), 'replied');
  $('#count').textContent = `${rows.length} of ${leads.length} leads, newest first`;
  $('#rows').innerHTML = rows.map(l => {
    const s = status(l);
    const canSend = !!l.email && !l.replied_at;
    const sendLabel = l.sent_at ? 'Send reminder' : 'Send email';
    return `
    <tr>
      <td data-label="Name"><strong>${esc(l.name)}</strong><br><span class="text-muted">${esc([l.title, l.company].filter(Boolean).join(', '))}</span>
        ${l.notes ? `<br><span class="text-muted text-xs">${esc(l.notes)}</span>` : ''}</td>
      <td data-label="Contact">${esc(l.email)}${l.email && l.phone ? '<br>' : ''}${esc(l.phone)}${l.website ? `<br><span class="text-muted">${esc(l.website)}</span>` : ''}</td>
      <td data-label="Country">${esc(l.country)}<br><span class="pill">${LANGS[l.lang] || l.lang}</span></td>
      <td data-label="Follow-up"><span class="st ${s.cls}" title="${esc(s.tip)}">${esc(s.label)}</span>
        ${l.sent_at && !l.replied_at ? `<label class="auto" title="Send automatic reminders if there is no reply"><input type="checkbox" data-act="auto" data-id="${l.id}" ${l.auto_remind ? 'checked' : ''}> auto-remind</label>` : ''}
        ${odooBadge(l)}</td>
      <td data-label="Added">${fmt(l.created_at)}<br><span class="text-muted">${esc(personName(l.user_id))}${l.event ? ' · ' + esc(l.event) : ''}</span></td>
      <td><div class="acts">
        <button class="btn btn-primary btn-sm" data-act="mail" data-id="${l.id}" ${canSend ? '' : 'disabled'} title="${l.email ? '' : 'No email address'}">${sendLabel}</button>
        <button class="btn btn-quiet btn-sm" data-act="edit" data-id="${l.id}">Edit</button>
        ${l.user_id === me.id ? `<button class="btn btn-quiet btn-sm btn-danger" data-act="del" data-id="${l.id}">Delete</button>` : ''}
      </div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" class="empty">${leads.length ? 'No leads match your filters.' : 'No leads yet. Scan your first card above.'}</td></tr>`;
}
['#search', '#filter', '#f-owner', '#f-status'].forEach(s => $(s).addEventListener('input', render));
$('#rows').addEventListener('change', async e => {
  const c = e.target.closest('input[data-act="auto"]'); if (!c) return;
  const lead = leads.find(l => l.id === c.dataset.id); if (!lead) return;
  if (await run(sb.from('leads').update({ auto_remind: c.checked }).eq('id', lead.id), 'Could not change reminders')) {
    lead.auto_remind = c.checked; toast(c.checked ? 'Automatic reminders on' : 'Automatic reminders off');
  } else c.checked = !c.checked;
});
$('#rows').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const lead = leads.find(l => l.id === b.dataset.id); if (!lead) return;
  if (b.dataset.act === 'mail') sendEmail(lead, lead.sent_at ? 'reminder' : 'first');
  if (b.dataset.act === 'odoo') syncOdoo(lead.id);
  if (b.dataset.act === 'edit') {
    editId = lead.id;
    FIELDS.forEach(k => { $('#f-' + k).value = lead[k] || ''; });
    $('#f-lang').value = lead.lang; $('#send-row').hidden = true;
    $('#form-title').textContent = 'Edit lead'; $('#f-submit').textContent = 'Save changes'; $('#f-cancel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' }); $('#f-name').focus();
  }
  if (b.dataset.act === 'del' && confirm(`Delete ${lead.name}? (It stays in Odoo if it was already synced.)`)) {
    if (await run(sb.from('leads').delete().eq('id', lead.id), 'Could not delete lead')) { await loadLeads(); toast('Lead deleted'); }
  }
});

/* ---------- Email ---------- */
async function sendEmail(lead, kind, afterSave = false) {
  if (!lead.email) { toast('This lead has no email address.'); return; }
  if (!settings().link) { toast('Add your brochure link in Settings first.'); openDialog(); return; }
  const t = (kind === 'first' ? store.templates : store.reminders)[lead.lang] || store.templates.en;
  const what = kind === 'first' ? 'the follow-up email' : 'a reminder';
  if (!afterSave && !confirm(`Send ${what} (${LANGS[lead.lang]}) to ${lead.name} <${lead.email}> from your mailbox?`)) return;
  toast(`Sending ${what} to ${lead.email}…`, 10000);
  const r = await callFn('send-email', { lead_id: lead.id, kind });
  if (r.code === 'not_configured') { composeInMailApp(lead, t); return; }
  if (r.error) { toast('Email not sent: ' + r.error, 7000); await loadLeads(); return; }
  toast(kind === 'first' ? `Email sent to ${lead.email}` : `Reminder sent to ${lead.email}`);
  await loadLeads();
}
// Fallback while Microsoft 365 sending is not set up: opens a ready-made draft (no tracking).
function composeInMailApp(lead, t) {
  const s = settings();
  const vars = { name: lead.name, first_name: (lead.name || '').split(/\s+/)[0], company: lead.company, brochure_link: s.link,
    sender: s.sender, my_company: s.company, event: lead.event || s.event };
  const fill = x => x.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] ?? '' : m));
  run(sb.from('leads').update({ sent_at: new Date().toISOString(), sent_by: me.id }).eq('id', lead.id), 'Could not record follow-up')
    .then(loadLeads);
  const web = { outlook: 'https://outlook.office.com/mail/deeplink/compose?', outlook_live: 'https://outlook.live.com/mail/0/deeplink/compose?' }[s.mailTarget];
  if (web) {
    window.open(`${web}to=${encodeURIComponent(lead.email)}&subject=${encodeURIComponent(fill(t.subject))}&body=${encodeURIComponent(fill(t.body))}`, '_blank');
    toast('Automatic sending is not set up yet: opening Outlook, press Send there.', 6000);
  } else {
    window.location.href = `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(fill(t.subject))}&body=${encodeURIComponent(fill(t.body).replace(/\r?\n/g, '\r\n'))}`;
  }
}

/* ---------- Odoo ---------- */
async function syncOdoo(id, quiet = false) {
  const r = await callFn('odoo-sync', { lead_id: id });
  if (r.code === 'not_configured') return;
  if (r.error) { if (!quiet) toast('Odoo: ' + r.error, 6000); }
  else if (!quiet) toast('Saved in Odoo');
  await loadLeads();
}

/* ---------- Settings dialog ---------- */
const dlg = $('#dlg');
function showTemplate() {
  const t = store[tplKind][tplLang];
  $('#t-subject').value = t.subject; $('#t-body').value = t.body;
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', x.dataset.lang === tplLang));
  document.querySelectorAll('.kind').forEach(x => x.setAttribute('aria-selected', x.dataset.kind === tplKind));
}
const keepEdits = () => { store[tplKind][tplLang] = { subject: $('#t-subject').value, body: $('#t-body').value }; };
function openDialog() {
  const s = settings();
  $('#s-link').value = s.link; $('#s-sender').value = s.sender; $('#s-company').value = s.company; $('#s-event').value = s.event || '';
  $('#s-days').value = s.reminderDays; $('#s-max').value = s.maxReminders; $('#s-mail').value = s.mailTarget || 'default';
  $('#s-from').textContent = me.email;
  $('#tabs').innerHTML = Object.entries(LANGS).map(([k, v]) => `<button type="button" class="tab" role="tab" data-lang="${k}">${v}</button>`).join('');
  showTemplate(); dlg.showModal();
}
$('#btn-templates').addEventListener('click', openDialog);
$('#tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t) return; keepEdits(); tplLang = t.dataset.lang; showTemplate(); });
$('#kinds').addEventListener('click', e => { const t = e.target.closest('.kind'); if (!t) return; keepEdits(); tplKind = t.dataset.kind; showTemplate(); });
$('#t-save').addEventListener('click', async () => {
  keepEdits();
  let link = $('#s-link').value.trim();
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  store.settings = {
    link, sender: $('#s-sender').value.trim(), company: $('#s-company').value.trim(), event: $('#s-event').value.trim(),
    reminderDays: Math.max(0, Number($('#s-days').value) || 0), maxReminders: Math.max(0, Number($('#s-max').value) || 0),
    mailTarget: $('#s-mail').value,
  };
  if (await saveSettings()) {
    if (store.settings.sender) await sb.from('profiles').update({ full_name: store.settings.sender }).eq('id', me.id);
    await loadPeople(); dlg.close(); if (!editId) $('#f-event').value = store.settings.event; render(); toast('Settings saved');
  }
});
$('#t-reset').addEventListener('click', () => {
  const defs = tplKind === 'templates' ? DEFAULT_TEMPLATES : DEFAULT_REMINDERS;
  if (confirm(`Restore the default ${LANGS[tplLang]} text?`)) { store[tplKind][tplLang] = structuredClone(defs[tplLang]); showTemplate(); }
});

/* ---------- CSV export ---------- */
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // blocks spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
}
$('#btn-export').addEventListener('click', () => {
  const rows = filtered();
  if (!rows.length) { toast('No leads to export.'); return; }
  const iso = t => (t ? new Date(t).toISOString() : '');
  const head = ['Name', 'Company', 'Job title', 'Email', 'Phone', 'Website', 'Address', 'Country', 'Language', 'Fair', 'Notes',
    'Added', 'Added by', 'Captured from', 'Email sent', 'Opens', 'Brochure clicks', 'Reminders', 'Replied', 'Status', 'Odoo ID'];
  const data = rows.map(l => [l.name, l.company, l.title, l.email, l.phone, l.website, l.address, l.country, LANGS[l.lang], l.event, l.notes,
    iso(l.created_at), personName(l.user_id), l.source || '', iso(l.sent_at), l.open_count, l.click_count, l.reminder_count, iso(l.replied_at),
    status(l).label, l.odoo_lead_id || '']);
  const csv = '﻿' + [head, ...data].map(r => r.map(csvCell).join(',')).join('\r\n'); // BOM keeps accents intact in Excel
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
});

/* ---------- Auth ---------- */
let needsPassword = /type=(invite|recovery)/.test(location.hash);
function show(view) {
  $('#login').hidden = view !== 'login'; $('#set-pass').hidden = view !== 'pass';
  $('#app').hidden = view !== 'app'; $('#hdr-btns').hidden = view !== 'app';
}
async function onSession(session) {
  me = session ? session.user : null;
  if (!session) { leads = []; $('#who').textContent = ''; show('login'); return; }
  if (needsPassword) { show('pass'); return; }
  show('app');
  await loadPeople(); await loadSettings();
  $('#who').textContent = `Signed in as ${people[me.id]?.full_name || me.email}`;
  resetForm(); await loadLeads();
}
if (sb) sb.auth.onAuthStateChange((_e, s) => setTimeout(() => { // setTimeout avoids a known supabase-js deadlock
  if (started && (s ? s.user.id : null) === (me && me.id)) return; // token refresh: nothing to reload
  started = true; onSession(s);
}, 0));
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!sb) { toast('Fill in config.js first.'); return; }
  const { error } = await sb.auth.signInWithPassword({ email: $('#l-email').value.trim(), password: $('#l-pass').value });
  if (error) toast(error.message);
});
$('#btn-forgot').addEventListener('click', async () => {
  const email = $('#l-email').value.trim();
  if (!email) { toast('Type your email first.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  toast(error ? error.message : 'Check your inbox for a link to set your password.', 6000);
});
$('#pass-form').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $('#p-new').value });
  if (error) { toast(error.message); return; }
  needsPassword = false;
  history.replaceState(null, '', location.pathname); toast('Password saved');
  const { data } = await sb.auth.getSession(); started = true; onSession(data.session);
});
$('#btn-out').addEventListener('click', () => sb.auth.signOut());
document.addEventListener('visibilitychange', () => { if (!document.hidden && me && !$('#app').hidden) loadLeads(); });
setInterval(() => { if (!document.hidden && me && !$('#app').hidden && !dlg.open) loadLeads(); }, 60000); // opens/replies update

/* ---------- Scanning: business cards, badges (photo + AI) and QR e-contacts ---------- */
let scans = [], scanMode = 'card', scanCodes = [], leadSource = 'manual';
const AUTO = ['name', 'company', 'title', 'email', 'phone', 'website', 'address', 'country', 'notes'];
AUTO.forEach(k => $('#f-' + k).addEventListener('input', e => { if (e.isTrusted) delete e.target.dataset.auto; })); // your edits are never overwritten
function startPhoto(mode) { scanMode = mode; scans = []; scanCodes = []; $('#card-input').click(); }
$('#btn-scan').addEventListener('click', () => startPhoto('card'));
$('#btn-badge').addEventListener('click', () => startPhoto('badge'));
$('#btn-back').addEventListener('click', () => $('#card-input').click());
$('#card-input').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  if (!scans.length) resetScanFields();
  $('#scan-box').classList.remove('hidden');
  let canvas;
  try {
    const img = await prepImage(file); canvas = img.canvas;
    scans.push(img.b64);
    $('#scan-thumbs').insertAdjacentHTML('beforeend', `<img src="${img.url}" class="thumb" alt="Photo ${scans.length}">`);
  } catch {
    setMsg('This photo format cannot be opened here. Take the photo with the camera or use a JPG/PNG.', 'err'); return;
  }
  const code = await decodeFrom(canvas).catch(() => null); // many cards and badges carry a QR code
  if (code) scanCodes.push(code);
  readPhoto();
});
function resetScanFields() {
  $('#scan-thumbs').innerHTML = '';
  if (!editId) AUTO.forEach(k => { const el = $('#f-' + k); if (el.dataset.auto) { el.value = ''; delete el.dataset.auto; } });
}
async function prepImage(file) { // resize to max 1600px JPEG: faster upload, same accuracy
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { url, b64: url.split(',')[1], canvas: c };
}
function setMsg(text, kind) { // kind: 'busy' | 'ok' | 'err'
  const m = $('#scan-msg');
  m.className = kind === 'busy' ? 'text-sm text-muted' : kind === 'err' ? 'err' : 'sent';
  m.innerHTML = (kind === 'busy' ? '<span class="spin"></span>' : '') + esc(text);
}
function fillFields(card, force = false) { // returns how many fields were filled
  if (card.other_phone) card.notes = [card.notes, 'Tel: ' + card.other_phone].filter(Boolean).join(' · ');
  let n = 0;
  for (const k of AUTO) {
    const el = $('#f-' + k);
    if (card[k] && (!el.value || el.dataset.auto) && (force || !el.dataset.qr)) {
      el.value = card[k]; el.dataset.auto = '1'; if (force) el.dataset.qr = '1'; n++;
    }
  }
  const l = langFor($('#f-country').value); if (l) $('#f-lang').value = l;
  return n;
}
const codeNote = parsed => (parsed.kind === 'link' ? 'QR link: ' : 'Badge code: ') + parsed.raw.slice(0, 200);
async function readPhoto() {
  const btns = ['#btn-scan', '#btn-badge', '#btn-qr', '#btn-back'].map($); btns.forEach(b => (b.disabled = true));
  const what = scanMode === 'badge' ? 'badge' : 'card';
  leadSource = scanMode;
  // 1) contact data from a QR code on the photo: exact, so it wins over what the AI reads
  let n = 0, codeText = '';
  document.querySelectorAll('#lead-form [data-qr]').forEach(el => delete el.dataset.qr);
  for (const raw of scanCodes) {
    const p = parseCode(raw);
    if (p.contact) n += fillFields(p.contact, true);
    else codeText = raw;
  }
  // 2) AI reads the printed text
  setMsg(scans.length > 1 ? 'Reading both sides…' : `Reading ${what}…`, 'busy');
  try {
    const r = await callFn('read-card', { images: scans, mode: scanMode, code_text: codeText || undefined });
    if (r.error) throw new Error(r.error);
    n += fillFields(r.data || {});
    if (codeText) { const el = $('#f-notes'); if (!el.value.includes(codeText.slice(0, 40))) el.value = [el.value, codeNote(parseCode(codeText))].filter(Boolean).join(' · '); }
    if (n) { setMsg(`${n} fields filled in${scanCodes.length ? ' (QR code read too)' : ''}. Please check them before saving.`, 'ok'); toast(`${n} fields read from the ${what}`); }
    else setMsg('No contact details found. Try a closer, straighter photo in good light.', 'err');
    $('#btn-back').classList.toggle('hidden', scanMode !== 'card' || scans.length > 1);
  } catch (err) {
    setMsg(n ? `${n} fields filled from the QR code. The printed text could not be read: ${err.message}` : 'Could not read the ' + what + ': ' + err.message, n ? 'ok' : 'err');
  } finally { btns.forEach(b => (b.disabled = false)); }
}

/* QR / barcode decoding: the phone's built-in reader when available, otherwise jsQR */
let jsQRLoading = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return jsQRLoading ||= new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = ok; s.onerror = () => { jsQRLoading = null; fail(new Error('Could not load the QR reader')); }; document.head.appendChild(s);
  });
}
let detector;
async function decodeFrom(source) { // source: canvas or video; returns the text or null
  if ('BarcodeDetector' in window) {
    try {
      detector ||= new BarcodeDetector({ formats: (await BarcodeDetector.getSupportedFormats())
        .filter(f => ['qr_code', 'pdf417', 'aztec', 'data_matrix', 'code_128', 'code_39'].includes(f)) });
      const found = await detector.detect(source);
      if (found.length) return found[0].rawValue;
      if (source instanceof HTMLCanvasElement) return null;
    } catch { /* fall back to jsQR */ }
  }
  await loadJsQR();
  let c = source;
  if (source instanceof HTMLVideoElement) {
    c = document.createElement('canvas'); c.width = source.videoWidth; c.height = source.videoHeight;
    if (!c.width) return null;
    c.getContext('2d').drawImage(source, 0, 0);
  }
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
}

/* Live QR scanning with the camera (e-contacts on a phone screen, badge QR codes) */
const qrDlg = $('#qr-dlg'); let qrStream = null, qrLoop = 0, qrTrack = null;
$('#btn-qr').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) { toast('The camera is not available in this browser.'); return; }
  try {
    // A higher captured resolution lets a small/far QR code still resolve to enough pixels to decode.
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1920 }, advanced: [{ zoom: 1 }] }, audio: false,
    });
  } catch {
    try { qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); }
    catch { toast('Allow camera access to scan QR codes.'); return; }
  }
  const v = $('#qr-video'); v.srcObject = qrStream; await v.play().catch(() => {});
  $('#qr-msg').textContent = 'Point the camera at the QR code. Use + to zoom in on small codes. If it is small, use the + to zoom in.';
  setupZoom();
  qrDlg.showModal();
  const tick = async () => {
    if (!qrStream) return;
    const text = await decodeFrom(v).catch(() => null);
    if (text) { onQr(text); return; }
    qrLoop = setTimeout(tick, 250);
  };
  tick();
});
function stopQr() { clearTimeout(qrLoop); qrStream?.getTracks().forEach(t => t.stop()); qrStream = null; qrTrack = null; if (qrDlg.open) qrDlg.close(); }
qrDlg.addEventListener('close', stopQr);
$('#qr-cancel').addEventListener('click', stopQr);

/* Optical zoom: uses the phone's own zoom lens/level through the camera track, like the native camera app.
   Supported on Chrome/Android; Safari/iOS has no API for this yet, so the box stays hidden there (pinch-to-zoom works instead). */
function setupZoom() {
  const box = $('#qr-zoom-box'), range = $('#qr-zoom');
  box.classList.add('hidden');
  qrTrack = qrStream?.getVideoTracks?.()[0] ?? null;
  const caps = qrTrack?.getCapabilities?.();
  if (!caps?.zoom) return; // no zoom lens control available from this browser
  range.min = caps.zoom.min; range.max = caps.zoom.max; range.step = caps.zoom.step || 0.1;
  range.value = qrTrack.getSettings?.().zoom ?? caps.zoom.min;
  box.classList.remove('hidden');
}
async function setZoom(v) {
  if (!qrTrack) return;
  const caps = qrTrack.getCapabilities?.(); if (!caps?.zoom) return;
  v = Math.min(caps.zoom.max, Math.max(caps.zoom.min, v));
  try { await qrTrack.applyConstraints({ advanced: [{ zoom: v }] }); $('#qr-zoom').value = v; } catch { /* device refused: ignore */ }
}
$('#qr-zoom').addEventListener('input', e => setZoom(Number(e.target.value)));
$('#qr-zoom-in').addEventListener('click', () => setZoom(Number($('#qr-zoom').value) + Number($('#qr-zoom').step || 0.5)));
$('#qr-zoom-out').addEventListener('click', () => setZoom(Number($('#qr-zoom').value) - Number($('#qr-zoom').step || 0.5)));
function onQr(text) {
  stopQr(); if (navigator.vibrate) navigator.vibrate(60);
  const p = parseCode(text);
  $('#scan-box').classList.remove('hidden'); $('#scan-thumbs').innerHTML = '';
  if (p.contact) {
    resetScanFields(); leadSource = 'qr';
    const n = fillFields(p.contact);
    setMsg(`${n} fields filled from the e-contact. Please check them before saving.`, 'ok'); toast(`${n} fields read from the QR code`);
  } else {
    const el = $('#f-notes'); el.value = [el.value, codeNote(p)].filter(Boolean).join(' · ');
    setMsg(p.kind === 'link'
      ? 'This QR code is a link, not a contact card. It was added to Notes. Open it on the phone to see the contact, or take a photo of the badge.'
      : 'This QR code has no contact details (only the fair\'s own badge ID). Use "Badge" to take a photo so the printed name and company are read.', 'err');
  }
}
