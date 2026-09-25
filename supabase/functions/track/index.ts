// Public endpoint used inside sent emails (no sign-in):
//   ?t=<token>&k=o  → invisible image, records an open
//   ?t=<token>&k=c  → records a click, then redirects to the brochure link that was sent
// Deploy with --no-verify-jwt (see supabase/config.toml).
import { admin } from '../_shared/util.ts';

const PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const token = u.searchParams.get('t') ?? '', kind = u.searchParams.get('k');
  let link: string | null = null;
  if (UUID.test(token)) {
    const { data } = await admin().rpc('track_email_event', { p_token: token, p_kind: kind === 'c' ? 'click' : 'open' });
    link = typeof data === 'string' ? data : null;
  }
  if (kind === 'c') {
    const safe = link && /^https?:\/\//i.test(link) ? link : null;
    return safe
      ? new Response(null, { status: 302, headers: { Location: safe, 'Cache-Control': 'no-store' } })
      : new Response('Link not found', { status: 404 });
  }
  return new Response(PIXEL, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
  });
});
