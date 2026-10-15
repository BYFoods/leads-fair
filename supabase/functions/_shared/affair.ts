// "A Portuguese Affair" invitation (Nata Pura + Frangus, SIAL Paris).
import { AFFAIR_BANNER_B64 } from './affair-banner.ts';
import { AFFAIR_VIDEO_THUMB_B64 } from './affair-video-thumb.ts';
import { env, type Lead } from './util.ts';

// Paris is on summer time (UTC+2) until Sunday 25 Oct 2026, so 18:00 on 19 Oct = 16:00 UTC.
export const INVITE_AT = Date.parse('2026-10-19T16:00:00Z');
// The party starts 20 Oct 17:00 Paris (15:00 UTC): an invitation after that is pointless, so it is never sent.
export const INVITE_UNTIL = Date.parse('2026-10-20T15:00:00Z');

export const INVITE_CID = 'affair-banner';
const THUMB_CID = 'affair-video';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// The video page lives on the app's own site (web/affair.html). APP_URL is optional: set it as a secret if the app is not at this address.
const videoPage = () => `${(env('APP_URL') || 'https://leads.byfoodsglobal.com').replace(/\/+$/, '')}/affair.html`;

// "Tomorrow" when it goes out on 19 Oct (Paris), "Today" if the lead is saved on the 20th.
const parisDay = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', day: 'numeric' }).format(new Date()));
const dayWord = () => (parisDay() >= 20 ? 'Today' : 'Tomorrow');

export function buildInvite(lead: Lead) {
  const when = dayWord();
  const subject = `${when}, 5 PM: A Portuguese Affair`;
  const p = (t: string) => `<p style="margin:0 0 14px">${t}</p>`;
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45">`
    + p(`${esc(String(lead.name ?? '').trim())},`)
    + p(`<strong>${when}, the fair ends. And the Affair begins.</strong>`)
    + p('No presentations. No pitch decks. Just warm pastéis de nata, a good glass of wine, the spicy side of Frangus and music to keep the evening going.')
    + p('Not convinced yet? Here are 40 seconds of how the last one went:')
    + `<p style="margin:0 0 6px"><a href="${esc(videoPage())}"><img src="cid:${THUMB_CID}" alt="Watch the video" width="480" style="display:block;border:0;width:100%;max-width:480px;height:auto"></a></p>`
    + p(`<a href="${esc(videoPage())}">▶ Watch the video</a>`)
    + p('Come straight from the aisles, as you are. We’ll save you a glass.')
    + p('📍 Stand 5A T086, SIAL Paris<br>📅 Tuesday, 20 October<br>🕕 5 PM')
    + p(`See you ${when.toLowerCase()},<br>Nata Pura + Frangus`)
    + `<img src="cid:${INVITE_CID}" alt="A Portuguese Affair – 20 October, 5 PM, SIAL Paris, Stand 5A T086" width="640" style="display:block;border:0;width:100%;max-width:640px;height:auto">`
    + '</div>';
  const inline = (name: string, type: string, b64: string, cid: string) => ({
    '@odata.type': '#microsoft.graph.fileAttachment', name, contentType: type, contentBytes: b64, isInline: true, contentId: cid,
  });
  const attachments = [
    inline('watch-the-video.jpg', 'image/jpeg', AFFAIR_VIDEO_THUMB_B64, THUMB_CID),
    inline('a-portuguese-affair.png', 'image/png', AFFAIR_BANNER_B64, INVITE_CID),
  ];
  return { subject, html, attachments };
}
