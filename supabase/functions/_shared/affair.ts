// "A Portuguese Affair" invitation (Nata Pura + Frangus, SIAL Paris).
import { AFFAIR_BANNER_B64 } from './affair-banner.ts';
import type { Lead } from './util.ts';

// Paris is on summer time (UTC+2) until Sunday 25 Oct 2026, so 18:00 on 19 Oct = 16:00 UTC.
export const INVITE_AT = Date.parse('2026-10-19T16:00:00Z');
// The party starts 20 Oct 17:00 Paris (15:00 UTC): an invitation after that is pointless, so it is never sent.
export const INVITE_UNTIL = Date.parse('2026-10-20T15:00:00Z');

export const INVITE_SUBJECT = 'A Portuguese Affair – 20 October, SIAL Paris (Stand 5A T086)';
export const INVITE_CID = 'affair-banner';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function buildInvite(lead: Lead) {
  const p = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45">`
    + p(`${esc(String(lead.name ?? '').trim())},`)
    + p('You know that moment at the end of a long day at SIAL when you’ve had enough of the crowds, the queues and the endless wait for a ride back?')
    + p('When all you really want is something delicious to eat, a good glass of wine and a sweet treat?')
    + p('Well, we’ve got you covered.')
    + p('The Portuguese Affair is exactly that.')
    + p('No fuss. No presentations. Just a good time.')
    + p('On Tuesday, 20 October, Nata Pura and Frangus invite you to join us for a relaxed Portuguese evening, right at our stand.')
    + p('Discover the spicy side of Frangus, indulge in the sweet side of Nata Pura, and in between… simply enjoy the music, the atmosphere and some great company.')
    + p('<strong>A PORTUGUESE AFFAIR</strong><br>Fair ends. Affair begins.')
    + p('📍 Stand 5A T086<br>📅 20 October<br>🕕 5 PM')
    + p('Nata Pura + Frangus')
    + `<img src="cid:${INVITE_CID}" alt="A Portuguese Affair – 20 October, 5 PM, SIAL Paris, Stand 5A T086" width="640" style="display:block;border:0;width:100%;max-width:640px;height:auto">`
    + '</div>';
  const attachments = [{
    '@odata.type': '#microsoft.graph.fileAttachment', name: 'a-portuguese-affair.png', contentType: 'image/png',
    contentBytes: AFFAIR_BANNER_B64, isInline: true, contentId: INVITE_CID,
  }];
  return { subject: INVITE_SUBJECT, html, attachments };
}
