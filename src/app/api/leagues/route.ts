import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { createLeague, parseNewLeague } from '@/lib/server/leagueCreation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Multi-league step 2: POST { name, visibility, defaultFormat?, defaultLocation?, joinAsPlayer } creates a league.
 * Any signed-in account with a verified email; the creator becomes its president.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    if (!caller.emailVerified) return NextResponse.json({ ok: false, error: 'email_not_verified' }, { status: 403 });
    const input = parseNewLeague(await request.json().catch(() => null));
    if (!input) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    const res = await createLeague({ uid: caller.uid, profileId: caller.profileId }, input);
    if ('error' in res) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === 'too_many' ? 429 : 404 });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (err) {
    console.error('[leagues] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
