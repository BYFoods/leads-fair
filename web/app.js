'use strict';
const LANGS = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch' };
const COUNTRIES = {
  'France': 'fr', 'Belgium': 'fr', 'Switzerland': 'de', 'Luxembourg': 'fr', 'Canada': 'en',
  'Germany': 'de', 'Austria': 'de', 'Spain': 'es', 'Mexico': 'es', 'Argentina': 'es', 'Colombia': 'es', 'Chile': 'es',
  'United Kingdom': 'en', 'United States': 'en', 'Ireland': 'en', 'Australia': 'en',
  'Italy': 'en', 'Netherlands': 'en', 'Portugal': 'en', 'Poland': 'en', 'Sweden': 'en', 'Denmark': 'en',
  'Morocco': 'fr', 'Tunisia': 'fr', 'Algeria': 'fr', 'Senegal': 'fr', 'Ivory Coast': 'fr',
  'China': 'en', 'Japan': 'en', 'India': 'en', 'United Arab Emirates': 'en', 'Turkey': 'en', 'Brazil': 'en'
};
const DEFAULT_TEMPLATES = {
  en: { subject: 'Great meeting you at the Paris trade fair',
    body: 'Hello {{name}},\n\nIt was a pleasure meeting you at the trade fair in Paris. Thank you for your interest in {{my_company}}.\n\nAs promised, here is our digital brochure:\n{{brochure_link}}\n\nI would be glad to answer any questions or arrange a call.\n\nBest regards,\n{{sender}}' },
  fr: { subject: 'Ravi de vous avoir rencontré au salon de Paris',
    body: 'Bonjour {{name}},\n\nJ\'ai été ravi de faire votre connaissance lors du salon à Paris. Merci de l\'intérêt que vous portez à {{my_company}}.\n\nComme convenu, voici notre brochure numérique :\n{{brochure_link}}\n\nJe reste à votre disposition pour toute question ou pour organiser un appel.\n\nCordialement,\n{{sender}}' },
  es: { subject: 'Un placer conocerle en la feria de París',
    body: 'Hola {{name}}:\n\nFue un placer conocerle en la feria de París. Gracias por su interés en {{my_company}}.\n\nTal como acordamos, aquí tiene nuestro catálogo digital:\n{{brochure_link}}\n\nQuedo a su disposición para resolver cualquier duda o concertar una llamada.\n\nUn cordial saludo,\n{{sender}}' },
  de: { subject: 'Schön, Sie auf der Messe in Paris getroffen zu haben',
    body: 'Guten Tag {{name}},\n\nes hat mich sehr gefreut, Sie auf der Messe in Paris kennenzulernen. Vielen Dank für Ihr Interesse an {{my_company}}.\n\nWie besprochen, finden Sie hier unsere digitale Broschüre:\n{{brochure_link}}\n\nGerne beantworte ich Ihre Fragen oder vereinbare ein Gespräch.\n\nMit freundlichen Grüßen\n{{sender}}' }
};

const $ = s => document.querySelector(s);
const configured = /^https:\/\/.+\.supabase\.co/.test(CONFIG.SUPABASE_URL) && !CONFIG.SUPABASE_ANON_KEY.includes('YOUR');
const sb = configured ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
if (!configured) $('#login-msg').textContent = 'Add your Supabase URL and key to config.js, then redeploy.';
let leads = [], templates = structuredClone(DEFAULT_TEMPLATES), settings = { link: '', sender: '', company: '' };
let editId = null, tplLang = 'en', toastTimer, userId = null, started = false, pendingLead = null;

const fromRow = r => ({ id: r.id, name: r.name, company: r.company, title: r.title || '', email: r.email, phone: r.phone, country: r.country,
  lang: r.lang, created: Date.parse(r.created_at), sentAt: r.sent_at ? Date.parse(r.sent_at) : null });
async function run(query, msg) { // returns null (and shows the reason) when Supabase reports an error
  const { data, error } = await query;
  if (error) { toast(`${msg}: ${error.message}`); return null; }
  return data ?? true;
}
async function loadLeads() {
  let all = [], from = 0;
  for (;;) { // Supabase returns at most 1000 rows per request
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).range(from, from + 999);
    if (error) { toast('Could not load leads: ' + error.message); return; }
    all = all.concat(data); if (data.length < 1000) break; from += 1000;
  }
  leads = all.map(fromRow); render();
}
async function loadSettings() {
  const { data, error } = await sb.from('app_settings').select('data').maybeSingle();
  if (error) { toast('Could not load your settings: ' + error.message); return; }
  if (data && data.data) {
    templates = Object.assign(structuredClone(DEFAULT_TEMPLATES), data.data.templates);
    settings = Object.assign(settings, data.data.settings);
  }
}
const saveSettings = () => run(sb.from('app_settings').upsert({ user_id: userId, data: { templates, settings } }), 'Could not save templates');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
const langOptions = extra => (extra || '') + Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

/* ---------- Form ---------- */
$('#f-lang').innerHTML = langOptions();
$('#filter').innerHTML = langOptions('<option value="">All languages</option>');
$('#countries').innerHTML = Object.keys(COUNTRIES).map(c => `<option value="${c}">`).join('');
$('#f-country').addEventListener('input', e => {
  const match = Object.keys(COUNTRIES).find(c => c.toLowerCase() === e.target.value.trim().toLowerCase());
  if (match) $('#f-lang').value = COUNTRIES[match];
});
$('#lead-form').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    name: $('#f-name').value.trim(), company: $('#f-company').value.trim(), title: $('#f-title').value.trim(), email: $('#f-email').value.trim(),
    phone: $('#f-phone').value.trim(), country: $('#f-country').value.trim(), lang: $('#f-lang').value
  };
  const btn = $('#f-submit'); btn.disabled = true;
  const ok = editId
    ? await run(sb.from('leads').update(data).eq('id', editId), 'Could not update lead')
    : await run(sb.from('leads').insert(data), 'Could not save lead');
  btn.disabled = false;
  if (!ok) return; // keep the form filled so nothing is lost
  toast(editId ? 'Lead updated' : 'Lead saved');
  resetForm(); await loadLeads();
});
function resetForm() {
  editId = null; $('#lead-form').reset(); $('#f-lang').value = 'en';
  document.querySelectorAll('#lead-form [data-auto]').forEach(el => delete el.dataset.auto);
  $('#scan-box').classList.add('hidden'); $('#scan-paste').value = '';
  $('#form-title').textContent = 'Add a lead'; $('#f-submit').textContent = 'Save lead'; $('#f-cancel').classList.add('hidden');
}
$('#f-cancel').addEventListener('click', resetForm);

/* ---------- List ---------- */
function render() {
  const q = $('#search').value.trim().toLowerCase(), f = $('#filter').value;
  const rows = leads
    .filter(l => (!f || l.lang === f) && [l.name, l.company, l.title, l.email, l.phone, l.country].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.created - a.created);
  $('#count').textContent = `${rows.length} of ${leads.length} leads, newest first`;
  $('#rows').innerHTML = rows.map(l => `
    <tr>
      <td data-label="Name"><strong>${esc(l.name)}</strong><br><span class="text-muted">${esc([l.title, l.company].filter(Boolean).join(", "))}</span></td>
      <td data-label="Contact">${esc(l.email)}${l.email && l.phone ? '<br>' : ''}${esc(l.phone)}</td>
      <td data-label="Country">${esc(l.country)}</td>
      <td data-label="Language"><span class="pill">${LANGS[l.lang]}</span></td>
      <td data-label="Added">${new Date(l.created).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        ${l.sentAt ? '<br><span class="sent">Follow-up sent</span>' : ''}</td>
      <td><div class="acts">
        <button class="btn btn-primary btn-sm" data-act="mail" data-id="${l.id}" ${l.email ? '' : 'disabled title="No email address"'}>Send email</button>
        <button class="btn btn-quiet btn-sm" data-act="edit" data-id="${l.id}">Edit</button>
        <button class="btn btn-quiet btn-sm btn-danger" data-act="del" data-id="${l.id}">Delete</button>
      </div></td>
    </tr>`).join('') || `<tr><td colspan="6" class="empty">${leads.length ? 'No leads match your search.' : 'No leads yet. Add your first contact above.'}</td></tr>`;
}
$('#search').addEventListener('input', render);
$('#filter').addEventListener('change', render);
$('#rows').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const lead = leads.find(l => l.id === b.dataset.id); if (!lead) return;
  if (b.dataset.act === 'mail') sendEmail(lead);
  if (b.dataset.act === 'edit') {
    editId = lead.id;
    $('#f-name').value = lead.name; $('#f-company').value = lead.company; $('#f-title').value = lead.title; $('#f-email').value = lead.email;
    $('#f-phone').value = lead.phone; $('#f-country').value = lead.country; $('#f-lang').value = lead.lang;
    $('#form-title').textContent = 'Edit lead'; $('#f-submit').textContent = 'Save changes'; $('#f-cancel').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' }); $('#f-name').focus();
  }
  if (b.dataset.act === 'del' && confirm(`Delete ${lead.name}?`)) {
    if (await run(sb.from('leads').delete().eq('id', lead.id), 'Could not delete lead')) { await loadLeads(); toast('Lead deleted'); }
  }
});

/* ---------- Email ---------- */
function sendEmail(lead) {
  // Only your name is needed, and only once: it is saved with your settings. The brochure link is optional.
  if (!settings.sender) {
    pendingLead = lead;
    toast('Add your name once, then press "Save and send".');
    openDialog(); return;
  }
  pendingLead = null;
  const vars = { name: lead.name, company: lead.company, brochure_link: settings.link, sender: settings.sender, my_company: settings.company };
  const fill = s => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  const t = templates[lead.lang] || templates.en;
  let tpl = t.body;
  if (!settings.link) tpl = tpl.split(/\n[ \t]*\n/).filter(p => !p.includes('{{brochure_link}}')).join('\n\n'); // no brochure: drop that paragraph
  const text = fill(tpl);
  lead.sentAt = Date.now(); render();
  sb.from('leads').update({ sent_at: new Date(lead.sentAt).toISOString() }).eq('id', lead.id)
    .then(({ error }) => { if (error) toast('Could not record follow-up: ' + error.message); });
  const web = { outlook: 'https://outlook.office.com/mail/deeplink/compose?', outlook_live: 'https://outlook.live.com/mail/0/deeplink/compose?' }[settings.mailTarget];
  if (web) { // opens a ready-to-send draft in Outlook on the web; you still press Send there
    window.open(`${web}to=${encodeURIComponent(lead.email)}&subject=${encodeURIComponent(fill(t.subject))}&body=${encodeURIComponent(text)}`, '_blank');
    toast('Opening Outlook…');
  } else {
    window.location.href = `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(fill(t.subject))}&body=${encodeURIComponent(text.replace(/\r?\n/g, '\r\n'))}`;
  }
}

/* ---------- Templates dialog ---------- */
const dlg = $('#dlg');
function showTemplate() {
  $('#t-subject').value = templates[tplLang].subject; $('#t-body').value = templates[tplLang].body;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.lang === tplLang));
}
function openDialog() {
  $('#s-link').value = settings.link; $('#s-sender').value = settings.sender; $('#s-company').value = settings.company;
  $('#s-mail').value = settings.mailTarget || 'default';
  $('#tabs').innerHTML = Object.entries(LANGS).map(([k, v]) => `<button type="button" class="tab" role="tab" data-lang="${k}">${v}</button>`).join('');
  $('#t-save').textContent = pendingLead ? 'Save and send' : 'Save';
  showTemplate(); dlg.showModal();
  if (pendingLead) $('#s-sender').focus();
}
$('#btn-templates').addEventListener('click', () => { pendingLead = null; openDialog(); });
dlg.addEventListener('close', () => { if (!$('#s-sender').value.trim()) pendingLead = null; });
$('#tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab'); if (!t) return;
  templates[tplLang] = { subject: $('#t-subject').value, body: $('#t-body').value }; // keep unsaved edits when switching
  tplLang = t.dataset.lang; showTemplate();
});
$('#t-save').addEventListener('click', async () => {
  templates[tplLang] = { subject: $('#t-subject').value, body: $('#t-body').value };
  settings = { link: $('#s-link').value.trim(), sender: $('#s-sender').value.trim(), company: $('#s-company').value.trim(), mailTarget: $('#s-mail').value };
  if (pendingLead && !settings.sender) { toast('Please add your name.'); $('#s-sender').focus(); return; }
  const lead = pendingLead; pendingLead = null;
  dlg.close();
  if (lead) sendEmail(lead); // open the email right away (before waiting), so the browser does not block the Outlook tab
  if (await saveSettings()) toast(lead ? 'Settings saved, opening email…' : 'Templates and settings saved');
});
$('#t-reset').addEventListener('click', () => {
  if (confirm(`Restore the default ${LANGS[tplLang]} template?`)) { templates[tplLang] = structuredClone(DEFAULT_TEMPLATES[tplLang]); showTemplate(); }
});

/* ---------- CSV export ---------- */
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // blocks spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
}
$('#btn-export').addEventListener('click', () => {
  if (!leads.length) { toast('No leads to export yet.'); return; }
  const head = ['Name', 'Company', 'Job title', 'Email', 'Phone', 'Country', 'Language', 'Added', 'Follow-up sent'];
  const rows = [...leads].sort((a, b) => b.created - a.created).map(l => [
    l.name, l.company, l.title, l.email, l.phone, l.country, LANGS[l.lang],
    new Date(l.created).toISOString(), l.sentAt ? new Date(l.sentAt).toISOString() : 'No'
  ]);
  const csv = '\uFEFF' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'); // BOM keeps accents intact in Excel
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
});

/* ---------- Auth ---------- */
async function onSession(session) {
  userId = session ? session.user.id : null;
  $('#login').hidden = !!session; $('#app').hidden = !session; $('#hdr-btns').hidden = !session;
  if (session) { await loadSettings(); await loadLeads(); } else { leads = []; render(); }
}
if (sb) sb.auth.onAuthStateChange((_e, s) => setTimeout(() => { // setTimeout avoids a known supabase-js deadlock
  if (started && (s ? s.user.id : null) === userId) return; // token refresh: nothing to reload
  started = true; onSession(s);
}, 0));
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!sb) { toast('Fill in config.js first.'); return; }
  const { error } = await sb.auth.signInWithPassword({ email: $('#l-email').value.trim(), password: $('#l-pass').value });
  if (error) toast(error.message);
});
$('#btn-out').addEventListener('click', () => sb.auth.signOut());
document.addEventListener('visibilitychange', () => { if (!document.hidden && userId) loadLeads(); }); // pick up leads added on another device

/* ---------- Business card: photo + pasted text ---------- */
// The phone reads the text (iPhone Live Text / Google Lens); the app only sorts it into fields.
const TITLE_RE = /\b(ceo|cto|cfo|coo|founder|co-?founder|owner|president|directeur|directrice|director|manager|head|sales|account|engineer|ingénieur|consultant|responsable|gerente|gestor|jefe|ventas|comercial|commercial|leiter|geschäftsführer|vertrieb|partner|export|purchasing|buyer|acheteur)\b/i;
const COMPANY_RE = /\b(sas|sarl|sa|gmbh|ag|ltd|limited|llc|inc|corp|bv|nv|sl|slu|lda|spa|srl|group|groupe|co)\b\.?/i;
const PREFIXES = { '+33': 'France', '+49': 'Germany', '+34': 'Spain', '+351': 'Portugal', '+44': 'United Kingdom', '+39': 'Italy',
  '+32': 'Belgium', '+41': 'Switzerland', '+31': 'Netherlands', '+1': 'United States', '+43': 'Austria', '+352': 'Luxembourg' };

function parseCard(text) { // rule-based: reliable for email and phone, a best guess for name, company and title
  text = text.replace(/\s*@\s*/g, '@'); // OCR often inserts spaces around the @
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 1);
  const out = { name: '', company: '', title: '', email: '', phone: '', country: '' };
  const em = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/); if (em) out.email = em[0].toLowerCase();
  const phones = [];
  lines.forEach(l => {
    const m = l.match(/\+?\d[\d\s().\-]{7,}\d/);
    if (m && (m[0].match(/\d/g) || []).length >= 9 && !/fax/i.test(l)) phones.push({ n: m[0].trim(), mobile: /mob|cell|gsm|\bm\b|portable/i.test(l) });
  });
  const ph = phones.find(p => p.mobile) || phones[0];
  if (ph) {
    out.phone = ph.n;
    const digits = ph.n.replace(/[^\d+]/g, '');
    const key = Object.keys(PREFIXES).sort((x, y) => y.length - x.length).find(k => digits.startsWith(k));
    if (key) out.country = PREFIXES[key];
  }
  const rest = lines.filter(l => !/@|www\.|https?:|\bfax\b/i.test(l) && (l.match(/\d/g) || []).length < 4);
  out.title = rest.find(l => TITLE_RE.test(l)) || '';
  out.company = rest.find(l => l !== out.title && COMPANY_RE.test(l)) || '';
  let name = rest.find(l => l !== out.title && l !== out.company && /^[\p{L}'’.-]+(?: [\p{L}'’.-]+){1,3}$/u.test(l)) || '';
  if (name && name === name.toUpperCase()) name = name.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  out.name = name;
  if (!out.company) out.company = rest.find(l => l !== out.title && l !== name && !TITLE_RE.test(l)) || '';
  return out;
}
const AUTO = { name: 'f-name', company: 'f-company', title: 'f-title', email: 'f-email', phone: 'f-phone', country: 'f-country' };
Object.values(AUTO).forEach(id => $('#' + id).addEventListener('input', e => { if (e.isTrusted) delete e.target.dataset.auto; })); // your edits are never overwritten
$('#btn-scan').addEventListener('click', () => $('#card-input').click());
$('#card-input').addEventListener('change', e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const img = $('#scan-thumb'); if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(file);
  $('#scan-box').classList.remove('hidden'); $('#scan-paste').value = ''; $('#scan-msg').classList.add('hidden');
  readCard(file); // starts reading straight away
});
function setMsg(text, kind) { // kind: 'busy' | 'ok' | 'err'
  const m = $('#scan-msg');
  m.className = kind === 'busy' ? 'text-sm text-muted' : kind === 'err' ? 'err' : 'sent';
  m.innerHTML = (kind === 'busy' ? '<span class="spin"></span>' : '') + esc(text);
}
function fillFromText() { // sorts the text into the form; returns how many fields were filled
  const text = $('#scan-paste').value.trim();
  if (!text) { $('#scan-msg').classList.add('hidden'); return 0; }
  const p = parseCard(text); let n = 0;
  for (const [k, id] of Object.entries(AUTO)) {
    const el = $('#' + id);
    if (p[k] && (!el.value || el.dataset.auto)) { el.value = p[k]; el.dataset.auto = '1'; n++; }
  }
  $('#f-country').dispatchEvent(new Event('input')); // re-runs the country to language rule
  if (n) setMsg(`${n} fields filled in. Please check them.`, 'ok');
  else setMsg('No contact details found. Try a closer, straighter photo in good light.', 'err');
  return n;
}
$('#scan-paste').addEventListener('input', fillFromText);

/* ---------- Automatic reading (free OCR in the browser) ---------- */
const OCR_LANGS = 'eng+fra+spa+deu'; // first use downloads these language files, then they are cached
let ocrWorker = null;
function loadScript(src) {
  return new Promise((ok, fail) => {
    if (window.Tesseract) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
  });
}
async function prepForOcr(file) { // upscale/downscale to about 2000px, grayscale and stretch contrast: helps OCR a lot
  const bmp = await createImageBitmap(file), k = 2000 / Math.max(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), px = img.data, hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) { const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0; px[i] = g; hist[g]++; }
  const total = px.length / 4; let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < total * 0.02; lo++);
  for (acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.02; hi--);
  const scale = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) { const v = Math.max(0, Math.min(255, (px[i] - lo) * scale)); px[i] = px[i + 1] = px[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return c;
}
async function readCard(file) {
  const btn = $('#btn-scan'); btn.disabled = true; setMsg('Reading card…', 'busy');
  try {
    if (!ocrWorker) {
      setMsg('Loading the reader (first time only)…', 'busy');
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      ocrWorker = await Tesseract.createWorker(OCR_LANGS, 1, {
        logger: m => { if (m.status === 'recognizing text') setMsg(`Reading card… ${Math.round(m.progress * 100)}%`, 'busy'); }
      });
    }
    setMsg('Reading card…', 'busy');
    const { data } = await ocrWorker.recognize(await prepForOcr(file));
    $('#scan-paste').value = data.text.trim();
    const n = fillFromText();
    toast(n ? `${n} fields filled from the card` : 'Could not find contact details on the card.');
  } catch {
    setMsg('Could not read the card. Check your connection and try again.', 'err');
    toast('Could not read the card.');
  } finally { btn.disabled = false; }
}
