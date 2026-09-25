'use strict';
// Reads QR / barcode content (e-contacts and badges) and turns it into contact fields.
// Supports vCard (2.1/3.0/4.0), MECARD, BIZCARD, mailto:, tel:, MATMSG and plain links/text.
(function (root) {
  const unesc = s => String(s ?? '').replace(/\\n/gi, ' ').replace(/\\([,;:\\])/g, '$1').trim();
  const splitUnesc = (s, sep) => { // split on sep not preceded by a backslash
    const out = []; let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; }
      if (s[i] === sep) { out.push(cur); cur = ''; } else cur += s[i];
    }
    out.push(cur); return out;
  };
  function qp(s) { // quoted-printable (vCard 2.1)
    try {
      const bytes = s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
      return decodeURIComponent(escape(bytes));
    } catch { return s; }
  }
  const empty = () => ({ name: '', company: '', title: '', email: '', phone: '', other_phone: '', website: '', address: '', country: '', notes: '' });
  const cleanWeb = u => u.replace(/^https?:\/\//i, '').replace(/\/$/, '');

  function vcard(text) {
    const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const c = empty(); const phones = []; let n = null; const notes = [];
    for (const raw of lines) {
      const i = raw.indexOf(':'); if (i < 0) continue;
      const head = raw.slice(0, i), params = head.split(';'), key = params[0].replace(/^item\d+\./i, '').toUpperCase();
      let val = raw.slice(i + 1);
      if (/ENCODING=QUOTED-PRINTABLE/i.test(head)) val = qp(val);
      const p = params.slice(1).join(';').toUpperCase();
      if (key === 'FN') c.name = unesc(val);
      else if (key === 'N') n = splitUnesc(val, ';').map(unesc);
      else if (key === 'ORG') c.company = unesc(splitUnesc(val, ';')[0]);
      else if (key === 'TITLE' || (key === 'ROLE' && !c.title)) c.title = unesc(val);
      else if (key === 'EMAIL' && !c.email) c.email = unesc(val).toLowerCase();
      else if (key === 'TEL') phones.push({ n: unesc(val).replace(/^tel:/i, ''), mobile: /CELL|MOBILE|IPHONE/.test(p), fax: /FAX/.test(p) });
      else if (key === 'URL' && !c.website) c.website = cleanWeb(unesc(val));
      else if (key === 'ADR' && !c.address) {
        const a = splitUnesc(val, ';').map(unesc); // pobox;ext;street;city;region;zip;country
        c.address = [a[2], [a[5], a[3]].filter(Boolean).join(' '), a[4]].filter(Boolean).join(', ');
        c.country = a[6] || '';
      } else if (key === 'NOTE') notes.push(unesc(val));
      else if (/^X-SOCIALPROFILE|^X-(LINKEDIN|WHATSAPP|WECHAT)/.test(key)) notes.push(unesc(val));
    }
    if (!c.name && n) c.name = [n[3], n[1], n[2], n[0], n[4]].filter(Boolean).join(' ').trim();
    const real = phones.filter(x => !x.fax && x.n);
    const best = real.find(x => x.mobile) || real[0];
    if (best) { c.phone = best.n; const other = real.find(x => x !== best); if (other) c.other_phone = other.n; }
    c.notes = notes.join(' · ');
    return c;
  }
  function keyed(body, map) { // MECARD / BIZCARD style: KEY:value;KEY:value;;
    const c = empty(); const parts = splitUnesc(body.replace(/;;\s*$/, ''), ';');
    for (const part of parts) {
      const i = part.indexOf(':'); if (i < 0) continue;
      const k = part.slice(0, i).toUpperCase(), v = unesc(part.slice(i + 1));
      const f = map[k]; if (!f || !v) continue;
      if (f === 'name' && v.includes(',')) { const [last, first] = v.split(','); c.name = `${first.trim()} ${last.trim()}`.trim(); }
      else if (f === 'phone' && c.phone) c.other_phone = c.other_phone || v;
      else if (f === 'first') c.name = (v + ' ' + c.name).trim();
      else if (f === 'last') c.name = (c.name + ' ' + v).trim();
      else if (!c[f]) c[f] = f === 'email' ? v.toLowerCase() : f === 'website' ? cleanWeb(v) : v;
    }
    return c;
  }

  // Returns { kind, contact, raw }. kind: 'contact' when real contact data was found, 'link', or 'code' (an ID only).
  function parseCode(raw) {
    const text = String(raw ?? '').trim();
    let c = null;
    if (/BEGIN:VCARD/i.test(text)) c = vcard(text);
    else if (/^MECARD:/i.test(text)) c = keyed(text.slice(7), { N: 'name', TEL: 'phone', EMAIL: 'email', ORG: 'company', URL: 'website', ADR: 'address', NOTE: 'notes', TITLE: 'title' });
    else if (/^BIZCARD:/i.test(text)) c = keyed(text.slice(8), { N: 'first', X: 'last', T: 'title', C: 'company', A: 'address', B: 'phone', E: 'email' });
    else if (/^MATMSG:/i.test(text)) { c = empty(); const m = text.match(/TO:([^;]+)/i); if (m) c.email = m[1].toLowerCase(); }
    else if (/^mailto:/i.test(text)) { c = empty(); c.email = decodeURIComponent(text.slice(7).split('?')[0]).toLowerCase(); }
    else if (/^tel:/i.test(text)) { c = empty(); c.phone = text.slice(4); }
    else if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(text)) { c = empty(); c.email = text.toLowerCase(); }
    if (c && (c.name || c.email || c.phone)) return { kind: 'contact', contact: c, raw: text };
    if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) return { kind: 'link', contact: null, raw: text };
    return { kind: 'code', contact: null, raw: text };
  }

  root.parseCode = parseCode;
  if (typeof module !== 'undefined') module.exports = { parseCode };
})(typeof window !== 'undefined' ? window : globalThis);
