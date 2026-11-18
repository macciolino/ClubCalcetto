import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { ghostPlayers, isInviteCode, isMemberOf, joinWithInvite, leagueFromInvite } from '@/lib/server/leagueMembers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Multi-league step 3, invite link `/join/{code}`.
 * GET ?code=…  → { leagueName } for anyone; signed in also { member, ghosts } (cards without an account to claim).
 * POST { code, claimPlayerId? } (signed in, verified email) → joins as a new player or as that ghost player.
 */
export async function GET(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  const code = new URL(request.url).searchParams.get('code') || '';
  const league = isInviteCode(code) ? await leagueFromInvite(code) : null;
  if (!league) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 });
  const caller = await callerFrom(request);
  if (!caller) return NextResponse.json({ ok: true, leagueName: league.name });
  const member = await isMemberOf(caller.uid, league.id);
  return NextResponse.json({ ok: true, leagueName: league.name, leagueId: league.id, member, ghosts: member ? [] : await ghostPlayers(league.id) });
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    if (!caller.emailVerified) return NextResponse.json({ ok: false, error: 'email_not_verified' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { code?: string; claimPlayerId?: string | null };
    if (!isInviteCode(body.code)) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 });
    const res = await joinWithInvite(body.code, caller, body.claimPlayerId || null);
    if (!res.ok) return NextResponse.json(res, { status: res.error === 'invalid' ? 404 : 400 });
    return NextResponse.json(res);
  } catch (err) {
    console.error('[join] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
