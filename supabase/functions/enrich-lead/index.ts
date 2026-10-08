// Researches a lead's company and contact on the web (Claude + web search) and returns:
// LinkedIn of the person, LinkedIn of the company, company revenue and business area.
// Anything not found stays empty. Secret: ANTHROPIC_API_KEY (web search must be enabled for the
// organisation in console.anthropic.com > Settings > Privacy). Optional: ENRICH_MODEL (default claude-sonnet-5).
import { callerOf, cors, env, json } from '../_shared/util.ts';

const PROMPT = (f: Record<string, string>) => `Research this business contact from a trade fair using web search, then answer.

Contact: ${f.name || '(unknown)'}${f.title ? `, ${f.title}` : ''}
Company: ${f.company || '(unknown)'}
Website: ${f.website || '(unknown)'}
Country: ${f.country || '(unknown)'}${f.email_domain ? `\nEmail domain: ${f.email_domain}` : ''}

Find, only if you are confident it is the right person/company (same company, same country/sector):
1. person_linkedin: the contact's personal LinkedIn profile URL (linkedin.com/in/...).
2. company_linkedin: the company's LinkedIn page URL (linkedin.com/company/...).
3. revenue: the company's annual revenue / turnover, with currency and year, e.g. "approx. EUR 120M (2023)". Only from a reliable source; if you only find a vague range or employee count, give the range or leave empty.
4. business_area: what the company does, in one short line (e.g. "Food importer and distributor, GCC region").

Rules:
- Never guess or invent. LinkedIn URLs must be ones you actually saw in the search results.
- Leave a field as an empty string when you did not find it. There is no need to explain what you did not find.
- Reply with ONLY a JSON object, no other text: {"person_linkedin":"","company_linkedin":"","revenue":"","business_area":""}`;

const slug = (u: string) => (u.toLowerCase().match(/linkedin\.com(\/(?:in|company)\/[^/?#\s]+)/)?.[1] ?? '').replace(/\/$/, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await callerOf(req))) return json({ error: 'Please sign in again.' }, 401);
  try {
    const b = await req.json();
    const f: Record<string, string> = {};
    for (const k of ['name', 'title', 'company', 'website', 'country', 'email_domain']) f[k] = typeof b[k] === 'string' ? b[k].trim().slice(0, 200) : '';
    if (!f.company && !f.name) return json({ error: 'Add a company or a name first.' }, 400);

    const messages: unknown[] = [{ role: 'user', content: PROMPT(f) }];
    const seen = new Set<string>(); // LinkedIn paths that really appeared in search results
    let text = '';
    for (let round = 0; round < 4; round++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(110_000),
        headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: env('ENRICH_MODEL') || 'claude-sonnet-5', max_tokens: 2000,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
          messages,
        }),
      });
      if (!res.ok) {
        console.error('Anthropic error', res.status, await res.text());
        return json({ error: `Research service returned ${res.status}. Check that web search is enabled for the Anthropic account.` }, 502);
      }
      const out = await res.json();
      text = '';
      for (const c of out.content ?? []) {
        if (c.type === 'text') text += c.text;
        if (c.type === 'web_search_tool_result' && Array.isArray(c.content))
          for (const r of c.content) { const s = slug(r.url ?? ''); if (s) seen.add(s); }
      }
      if (out.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: out.content }); // long search: let it continue
    }

    let found: Record<string, unknown> = {};
    try { found = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}'); } catch { /* nothing usable */ }
    const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const link = (v: unknown, kind: 'in' | 'company') => {
      const u = clean(v, 300), s = slug(u);
      return s.startsWith(`/${kind}/`) && seen.has(s) ? `https://www.linkedin.com${s}` : '';
    };
    return json({
      person_linkedin: link(found.person_linkedin, 'in'),
      company_linkedin: link(found.company_linkedin, 'company'),
      revenue: clean(found.revenue, 160),
      business_area: clean(found.business_area, 200),
    });
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not research this lead right now.' }, 500);
  }
});
