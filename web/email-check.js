'use strict';
/* Email sanity check for the lead form. Pure functions (no DOM) so they can be tested in Node.
   check(email, website) → [{ level: 'error' | 'warn' | 'info', msg, fix? }], most severe first.
   Catches: broken syntax, characters OCR often invents, a mistyped well-known domain (gmial.com),
   a mistyped ending (.con), generic providers, throw-away domains, shared mailboxes (info@),
   and an email domain that does not match the website. mxStatus() asks public DNS whether the domain can receive mail. */
const EmailCheck = (() => {
  const GENERIC = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.es', 'hotmail.it', 'outlook.com', 'outlook.pt',
    'outlook.fr', 'live.com', 'live.fr', 'msn.com', 'yahoo.com', 'yahoo.fr', 'yahoo.es', 'yahoo.de', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com',
    'aol.com', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.com', 'proton.me', 'protonmail.com', 'sapo.pt', 'iol.pt', 'netcabo.pt', 'orange.fr',
    'free.fr', 'wanadoo.fr', 'sfr.fr', 'laposte.net', 't-online.de', 'libero.it', 'mail.ru', 'yandex.com', 'yandex.ru', 'qq.com', '163.com', '126.com', 'zoho.com'];
  const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com',
    'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com'];
  const ROLE = ['info', 'contact', 'contacto', 'contato', 'sales', 'office', 'admin', 'hello', 'mail', 'enquiries', 'enquiry', 'commercial', 'comercial',
    'marketing', 'export', 'procurement', 'purchasing', 'support', 'reception', 'geral', 'ventas', 'infos', 'bureau'];
  const TLD_COMMON = ['com', 'net', 'org'];

  const lev = (a, b) => { // Damerau-Levenshtein (a swapped pair such as "gmial" counts as 1)
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  };
  const rootOf = host => { // example.co.uk → example, shop.example.com → example
    const p = String(host).toLowerCase().replace(/^www\./, '').split('.');
    return p.length > 2 && p[p.length - 2].length <= 3 && p[p.length - 1].length === 2 ? p[p.length - 3] : p.length > 1 ? p[p.length - 2] : p[0];
  };
  const hostOf = site => {
    const m = String(site || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)/);
    return m ? m[1].replace(/^www\./, '') : '';
  };

  function check(raw, website = '') {
    const out = [];
    const add = (level, msg, fix) => out.push({ level, msg, ...(fix ? { fix } : {}) });
    let e = String(raw ?? '').trim();
    if (!e) return out;
    const original = e;

    // 1. Things a camera/OCR commonly gets wrong: we offer a cleaned-up version.
    let cleaned = e.replace(/^mailto:/i, '').replace(/^[<(\[]+|[>)\].,;:]+$/g, '')
      .replace(/\s*(\(at\)|\[at\]|\{at\}|©|＠)\s*/gi, '@').replace(/\s+/g, '').replace(/\.{2,}/g, '.');
    if (cleaned.includes('@')) cleaned = cleaned.replace(/,(?=[^@]*$)/g, '.'); // comma in the domain → dot
    const hadSpaces = /\s/.test(e);
    if (cleaned !== original && /^[^@\s]+@[^@\s]+$/.test(cleaned)) {
      add('warn', hadSpaces ? 'Spaces in the address (often a scan error).' : 'The address looks mis-read (stray symbol or punctuation).', cleaned);
      e = cleaned;
    }

    const ats = (e.match(/@/g) || []).length;
    if (ats === 0) { add('error', 'Missing "@". Check the card.'); return out; }
    if (ats > 1) { add('error', 'More than one "@". Check the card.'); return out; }
    const [local, domainRaw] = e.split('@');
    const domain = domainRaw.toLowerCase();
    if (!local) { add('error', 'Nothing before the "@".'); return out; }
    if (!domain) { add('error', 'Nothing after the "@".'); return out; }
    const bad = local.match(/[^A-Za-z0-9._%+'-]/);
    if (bad) add('error', `Unusual character "${bad[0]}" before the "@": probably a scan error.`);
    if (/^\.|\.$/.test(local)) add('error', 'The part before the "@" starts or ends with a dot.');
    if (!domain.includes('.')) {
      add('error', 'The domain is incomplete (no ".com", ".fr"…).');
      return sort(out);
    }
    const badD = domain.match(/[^a-z0-9.-]/);
    if (badD) add('error', `Unusual character "${badD[0]}" in the domain: probably a scan error.`);
    if (/^[.-]|[.-]$|\.-|-\./.test(domain)) add('error', 'The domain has a misplaced dot or dash.');

    const labels = domain.split('.'), tld = labels[labels.length - 1], rest = labels.slice(0, -1).join('.');
    const fixWith = d => `${local}@${d}`;

    // 2. Ending typo: .con, .cm, .comm, .c0m …
    if (tld.length !== 2 && !TLD_COMMON.includes(tld) && /^[a-z0-9]+$/.test(tld)) {
      const near = TLD_COMMON.find(t => lev(tld, t) === 1 && tld.length <= 4);
      if (near && !['co', 'io', 'eu', 'fr', 'de', 'es', 'pt', 'it', 'uk', 'ae', 'in', 'us', 'ca', 'nl', 'be', 'ch', 'at', 'pl'].includes(tld))
        add('warn', `Ending ".${tld}" looks like a typo for ".${near}".`, fixWith(`${rest}.${near}`));
    }
    if (/\d/.test(tld) && !out.some(o => o.fix)) add('warn', `The ending ".${tld}" contains a digit: probably a scan error.`);

    // 3. Well-known provider mistyped (gmial.com, hotmial.com, yaho.com…)
    const known = GENERIC.includes(domain);
    if (!known) {
      let best = null;
      for (const g of GENERIC) {
        const dist = lev(domain, g);
        if (dist > 0 && dist <= (g.length >= 9 ? 2 : 1) && (!best || dist < best[1])) best = [g, dist];
      }
      if (best) add('error', `"${domain}" looks like a typo for "${best[0]}".`, fixWith(best[0]));
    }

    // 4. What kind of address is it?
    if (DISPOSABLE.includes(domain)) add('error', 'Throw-away email domain.');
    else if (known) add('warn', 'Generic provider: not a company address.');
    if (ROLE.includes(local.toLowerCase())) add('info', `Shared mailbox (${local}@): replies may not reach the person you met.`);

    // 5. Does the domain match the website?
    const site = hostOf(website);
    if (site && !known && rootOf(site) !== rootOf(domain)) {
      const close = lev(rootOf(site), rootOf(domain)) <= 2;
      add(close ? 'warn' : 'info', `Email domain (${domain}) differs from the website (${site}).`, close ? fixWith(site) : undefined);
    }
    return sort(out);
  }
  const RANK = { error: 0, warn: 1, info: 2 };
  function sort(list) { return list.sort((a, b) => RANK[a.level] - RANK[b.level]); }

  // Can this domain receive email? Public DNS-over-HTTPS (only the domain is sent, never the full address).
  // Returns 'ok' | 'none' | 'unknown'. Network problems are 'unknown' and never shown.
  const cache = new Map();
  async function mxStatus(domain) {
    domain = String(domain).toLowerCase();
    if (cache.has(domain)) return cache.get(domain);
    const q = type => fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json());
    let res = 'unknown';
    try {
      const mx = await q('MX');
      if (mx.Status === 3) res = 'none';
      else if ((mx.Answer || []).some(a => a.type === 15)) res = 'ok';
      else if (mx.Status === 0) { const a = await q('A'); res = (a.Answer || []).length ? 'ok' : 'none'; }
    } catch { res = 'unknown'; }
    if (res !== 'unknown') cache.set(domain, res);
    return res;
  }
  return { check, mxStatus };
})();
if (typeof module !== 'undefined') module.exports = EmailCheck;
