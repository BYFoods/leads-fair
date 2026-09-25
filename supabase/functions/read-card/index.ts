// Reads a business card (front, and optionally back) with Claude vision and returns the contact fields.
// Secret: ANTHROPIC_API_KEY. Optional: OCR_MODEL (default claude-sonnet-5). Only signed-in users can call it.
import { callerOf, cors, env, json } from '../_shared/util.ts';

const str = { type: 'string' };
const FIELDS = {
  name: { ...str, description: 'Full name of the person, in natural capitalisation (e.g. "Jean-Luc Martin", not "JEAN-LUC MARTIN").' },
  company: { ...str, description: 'Company or organisation name, without the slogan.' },
  title: { ...str, description: 'Job title / position.' },
  email: { ...str, description: 'Email address of the person, lowercase. If several, the personal one (not info@/sales@).' },
  phone: { ...str, description: 'Best phone number, preferring mobile, in international format like +33 6 12 34 56 78 when the country is known.' },
  other_phone: { ...str, description: 'A second phone number (landline/office), same format. Empty if none. Never a fax.' },
  website: { ...str, description: 'Website, without https://.' },
  address: { ...str, description: 'Postal address on one line (street, postcode, city).' },
  country: { ...str, description: 'Country in English (e.g. "Germany"), from the address, phone prefix or domain. Empty if unclear.' },
  notes: { ...str, description: 'Anything else useful that is printed (other emails, WhatsApp/WeChat, LinkedIn, fax). Short. Empty if none.' },
};
const PROMPT = `These are photos of one business card (front, and back if a second image is given).
Extract the contact details of the person on the card, exactly as printed. Rules:
- Never invent or guess: use an empty string for anything not printed.
- Cards may be in any language or script. If both a Latin-script and a non-Latin version (Arabic, Chinese, Cyrillic…) are printed, use the Latin one.
- Distinguish carefully between person name, company name and job title; logos often contain the company name.
- Fix obvious reading errors in emails and websites (spaces, "(at)"), but do not change the spelling of names.
- Photos can be rotated, angled or blurry: read carefully.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(await callerOf(req))) return json({ error: 'Please sign in again.' }, 401);
  try {
    const body = await req.json();
    const images: string[] = (body.images ?? (body.image ? [body.image] : [])).slice(0, 2);
    if (!images.length || images.some(i => typeof i !== 'string' || i.length > 6_000_000)) {
      return json({ error: 'Missing or oversized image' }, 400);
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env('OCR_MODEL') || 'claude-sonnet-5',
        max_tokens: 1000,
        tools: [{
          name: 'save_card', description: 'Save the contact details printed on a business card.',
          input_schema: { type: 'object', required: Object.keys(FIELDS), properties: FIELDS },
        }],
        tool_choice: { type: 'tool', name: 'save_card' },
        messages: [{ role: 'user', content: [
          ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
          { type: 'text', text: PROMPT },
        ] }],
      }),
    });
    if (!res.ok) {
      console.error('Anthropic error', res.status, await res.text());
      return json({ error: `Reading service returned ${res.status}` }, 502);
    }
    const out = await res.json();
    const tool = out.content?.find((c: { type: string }) => c.type === 'tool_use');
    const card = tool ? tool.input : {};
    for (const k of Object.keys(FIELDS)) card[k] = typeof card[k] === 'string' ? card[k].trim() : '';
    card.email = card.email.toLowerCase().replace(/\s+/g, '');
    card.website = card.website.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    return json(card);
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not process the card' }, 500);
  }
});
