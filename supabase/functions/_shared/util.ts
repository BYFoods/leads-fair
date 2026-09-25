// Shared helpers for the Fair Leads edge functions.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
export const env = (k: string) => Deno.env.get(k) ?? '';

// Service-role client: bypasses RLS, so only use it after checking who is calling.
export const admin = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// Returns the signed-in user that called the function, or null.
export async function callerOf(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error ? null : data.user;
}

/* ---------- Email templates ---------- */
export type Lead = Record<string, any>;
export type Settings = {
  templates?: Record<string, { subject: string; body: string }>;
  reminders?: Record<string, { subject: string; body: string }>;
  settings?: { link?: string; sender?: string; company?: string; event?: string; reminderDays?: number; maxReminders?: number };
};

export async function settingsOf(userId: string): Promise<Settings> {
  const { data } = await admin().from('app_settings').select('data').eq('user_id', userId).maybeSingle();
  return (data?.data ?? {}) as Settings;
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const LINK = '\u0000LINK\u0000';

// Builds the email from a saved template. The brochure link goes through the click tracker,
// and an invisible 1x1 image records opens.
export function buildEmail(t: { subject: string; body: string }, lead: Lead, s: Settings['settings'] = {}) {
  const first = String(lead.name ?? '').trim().split(/\s+/)[0] ?? '';
  const vars: Record<string, string> = {
    name: lead.name ?? '', first_name: first, company: lead.company ?? '', sender: s.sender ?? '',
    my_company: s.company ?? '', event: lead.event || s.event || '', brochure_link: LINK,
  };
  const fill = (x: string) => x.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
  const subject = fill(t.subject).replaceAll(LINK, s.link ?? '').trim();
  const base = `${env('SUPABASE_URL')}/functions/v1/track?t=${lead.track_token}`;
  const link = s.link ?? '';
  const anchor = link ? `<a href="${escHtml(`${base}&k=c`)}">${escHtml(link)}</a>` : '';
  const html = escHtml(fill(t.body))
    .replace(/\r?\n/g, '<br>')
    .replaceAll(LINK, anchor)
    + `<img src="${escHtml(`${base}&k=o`)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;
  return { subject, html: `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45">${html}</div>` };
}

/* ---------- Microsoft 365 (Graph, app-only) ---------- */
export const m365Ready = () => !!(env('MS_TENANT_ID') && env('MS_CLIENT_ID') && env('MS_CLIENT_SECRET'));
let graphToken: { value: string; exp: number } | null = null;
async function graph(path: string, init: RequestInit = {}) {
  if (!graphToken || graphToken.exp < Date.now() + 60_000) {
    const r = await fetch(`https://login.microsoftonline.com/${env('MS_TENANT_ID')}/oauth2/v2.0/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: env('MS_CLIENT_ID'), client_secret: env('MS_CLIENT_SECRET'),
        scope: 'https://graph.microsoft.com/.default',
      }),
    });
    const t = await r.json();
    if (!r.ok) throw new Error(`Microsoft sign-in failed: ${t.error_description ?? r.status}`);
    graphToken = { value: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  }
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init, headers: { Authorization: `Bearer ${graphToken.value}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

// Sends from the user's own mailbox (it appears in their Sent Items).
export async function sendMail(from: string, to: string, subject: string, html: string) {
  const r = await graph(`/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST',
    body: JSON.stringify({
      message: { subject, body: { contentType: 'HTML', content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: true,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`Microsoft 365 refused the email (${r.status}): ${e?.error?.message ?? 'unknown error'}`);
  }
}

// Earliest message from `sender` in `mailbox` received after `since`, or null.
export async function firstReply(mailbox: string, sender: string, since: string) {
  const q = new URLSearchParams({
    $filter: `from/emailAddress/address eq '${sender.replace(/'/g, "''")}'`,
    $select: 'receivedDateTime', $top: '25',
  });
  const r = await graph(`/users/${encodeURIComponent(mailbox)}/messages?${q}`);
  if (!r.ok) throw new Error(`Could not check replies (${r.status})`);
  const { value } = await r.json();
  const after = Date.parse(since);
  const times = (value ?? []).map((m: { receivedDateTime: string }) => Date.parse(m.receivedDateTime))
    .filter((t: number) => t > after).sort((a: number, b: number) => a - b);
  return times.length ? new Date(times[0]).toISOString() : null;
}
