import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { adminCaller } from '@/lib/server/adminRequests';
import { currentLeague, scoped } from '@/lib/server/leagueScope';
import { leagueInviteCode } from '@/lib/server/leagueMembers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Multi-league step 3: POST { regenerate? } → { code } of the active league's invite link. Presidents and collaborators. */
async function handlePost(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await adminCaller(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as { regenerate?: boolean };
    const code = await leagueInviteCode(currentLeague(), caller.profileId, body.regenerate === true);
    return NextResponse.json({ ok: true, code });
  } catch (err) {
    console.error('[league-invite] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

/** Multi-league: runs in the league the app is using (header x-league-id). */
export const POST = scoped(handlePost);
