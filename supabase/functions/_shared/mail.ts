// Sends the first follow-up or a reminder for one lead, and records it on the lead.
import { admin, buildEmail, sendMail, settingsOf, type Lead, type Settings } from './util.ts';
import { odooNote } from './odoo.ts';
import { buildInvite, INVITE_UNTIL } from './affair.ts';

export type Kind = 'first' | 'reminder';

export async function deliver(lead: Lead, sender: { id: string; email: string }, kind: Kind) {
  const db = admin();
  if (!lead.email) throw new Error('This lead has no email address.');
  if (kind === 'reminder' && !lead.sent_at) kind = 'first'; // nothing sent yet: send the first email
  const s = await settingsOf(sender.id);
  const set = s.settings ?? {};
  if (!set.link) throw new Error('Add your brochure link in Settings first.');

  const pick = (all: Settings['templates']) => all?.[lead.lang] ?? all?.en;
  const t = kind === 'first' ? pick(s.templates) : pick(s.reminders);
  if (!t) throw new Error(`No ${kind === 'first' ? 'email' : 'reminder'} template saved. Open Settings and press Save once.`);
  const { subject, html } = buildEmail(t, lead, set);
  const finalSubject = kind === 'reminder' && lead.sent_subject ? `Re: ${lead.sent_subject}` : subject;

  try {
    await sendMail(sender.email, lead.email, finalSubject, html);
  } catch (e) {
    await db.from('leads').update({ email_error: (e as Error).message.slice(0, 500) }).eq('id', lead.id);
    throw e;
  }
  const now = new Date().toISOString();
  const patch = kind === 'first'
    ? { sent_at: now, sent_by: sender.id, sent_from: sender.email, sent_subject: finalSubject, sent_link: set.link, email_error: null }
    : { last_reminder_at: now, reminder_count: (lead.reminder_count ?? 0) + 1, sent_link: set.link, email_error: null };
  const { data } = await db.from('leads').update(patch).eq('id', lead.id).select().single();
  await odooNote(lead, kind === 'first'
    ? `Follow-up email sent to ${lead.email} by ${sender.email}: "${finalSubject}"`
    : `Reminder #${(lead.reminder_count ?? 0) + 1} sent to ${lead.email} by ${sender.email}`);
  return data;
}

// Sends the "A Portuguese Affair" invitation once. The row is claimed first (invite_sent_at), so the
// hourly job and a click in the app can never both send it.
export async function deliverInvite(lead: Lead, sender: { email: string }) {
  const db = admin();
  if (!lead.email) throw new Error('This lead has no email address.');
  if (Date.now() >= INVITE_UNTIL) throw new Error('The Portuguese Affair has already started: the invitation was not sent.');
  const { data: claimed } = await db.from('leads')
    .update({ invite_sent_at: new Date().toISOString() }).eq('id', lead.id).is('invite_sent_at', null).select().maybeSingle();
  if (!claimed) throw new Error('The invitation was already sent to this lead.');

  const { subject, html, attachments } = buildInvite(lead);
  try {
    await sendMail(sender.email, lead.email, subject, html, attachments);
  } catch (e) {
    await db.from('leads').update({ invite_sent_at: null, invite_error: (e as Error).message.slice(0, 500) }).eq('id', lead.id);
    throw e;
  }
  const { data } = await db.from('leads')
    .update({ invite_affair: true, invite_from: sender.email, invite_error: null }).eq('id', lead.id).select().single();
  await odooNote(lead, `Portuguese Affair invitation sent to ${lead.email} by ${sender.email}`);
  return data;
}
