import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { leagueMemberEmails } from '@/lib/server/emailPrivacy';
import { currentLeague, memberCard, scoped } from '@/lib/server/leagueScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET → { ok, emails: { profileId: email } } of the members of the ACTIVE league (header x-league-id) only.
 * Allowed only to its presidents and collaborators (also while the league is suspended: reading only); the
 * platform super admin too only where it manages the league. Never the emails of people outside that league.
 */
async function handleGet(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const leagueId = currentLeague();
    let allowed = false;
    if (caller.emailVerified) {
      const card = await memberCard(caller.uid, leagueId);
      const role = card?.data.leagueRole;
      allowed = Boolean(card && !card.data.deactivated_at && !card.data.removed_at && (role === 'PRESIDENT' || role === 'COLLABORATOR'));
    }
    if (!allowed) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ ok: true, emails: await leagueMemberEmails(leagueId) });
  } catch (err) {
    console.error('[league-emails] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

/** Multi-league: runs in the league the app is using (header x-league-id). */
export const GET = scoped(handleGet);
