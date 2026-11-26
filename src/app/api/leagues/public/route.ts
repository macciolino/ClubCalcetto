import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { joinPublicLeague, publicLeaguesFor } from '@/lib/server/publicLeagues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public leagues (visibility `public`), for someone who belongs to no league yet.
 * GET  → { leagues } the active public leagues this account is not in: name, usual format, average OVR (null =
 *        "Nuova lega"), players, matches played. Signed in with a verified email.
 * POST { leagueId } → joins that public league directly: new card from the Radar Base, values UNCONFIRMED.
 *        A private, suspended or missing league answers 404 `not_public`.
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    if (!caller.emailVerified) return NextResponse.json({ ok: false, error: 'email_not_verified' }, { status: 403 });
    return NextResponse.json({ ok: true, leagues: await publicLeaguesFor(caller.uid) });
  } catch (err) {
    console.error('[leagues/public] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    if (!caller.emailVerified) return NextResponse.json({ ok: false, error: 'email_not_verified' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { leagueId?: string };
    const res = await joinPublicLeague(caller, String(body.leagueId || ''));
    return NextResponse.json(res, { status: res.ok ? 200 : 404 });
  } catch (err) {
    console.error('[leagues/public] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
