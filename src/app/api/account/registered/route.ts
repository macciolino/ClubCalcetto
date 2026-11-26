import { NextResponse } from 'next/server';
import { adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { cleanLeagueId, inLeague } from '@/lib/server/leagueScope';
import { callerFrom, closeRequest } from '@/lib/server/adminRequests';
import { claimGuest } from '@/lib/server/profileMerge';
import { ensureLeagueCard } from '@/lib/server/leagueMembers';

export const runtime = 'nodejs';

/**
 * Called by the app right after a NEW profile is created (first sign-in), or when an old guest invite is opened.
 *  - with { invite } (old guest link `/login?invite=…`, made from a guest in Giocatori): the account joins THAT league
 *    and takes over the guest's card (matches, stats, sign-ups); the link is then used up.
 *  - without: multi-league step 3 — the account is in no league yet (welcome screen, then `/join/{code}` links).
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const db = adminDb();
    const profile = (await db.doc(`profiles/${caller.profileId}`).get()).data();
    if (!profile) return NextResponse.json({ ok: false, error: 'no_profile' }, { status: 404 });
    const { invite, isNew } = (await request.json().catch(() => ({}))) as { invite?: string; isNew?: boolean };

    if (invite && /^[A-Za-z0-9_-]{20,64}$/.test(invite)) {
      const ref = db.doc(`invites/${invite}`);
      // Il link si usa una volta sola, anche con due richieste insieme
      const inv = await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(ref)).data();
        if (!fresh || fresh.used_at || String(fresh.expires_at) <= new Date().toISOString()) return null;
        tx.update(ref, { used_at: new Date().toISOString(), used_by: caller.profileId });
        return fresh;
      });
      if (!inv) return NextResponse.json({ ok: false, error: 'invite_invalid' }, { status: 400 });
      try {
        const leagueId = cleanLeagueId(inv.league_id);
        const league = (await db.doc(`leagues/${leagueId}`).get()).data();
        await ensureLeagueCard(leagueId, caller, String(league?.name || ''));
        const { guestName } = await inLeague(leagueId, () => claimGuest(String(inv.guest_id), caller.profileId));
        await inLeague(leagueId, () => closeRequest(`signup_${caller.profileId}`, 'invite', `linked:${inv.guest_id}`)).catch(() => undefined);
        return NextResponse.json({ ok: true, claimed: true, guestName, leagueId });
      } catch (err) {
        await ref.update({ used_at: null, used_by: null }); // non riuscito: il link resta valido
        throw err;
      }
    }
    // A new account (not a guest taken over by an invite) starts with the Radar Base step, before any league or the board
    let baseRadarPending = false;
    if (isNew === true && !profile.baseRadar && profile.base_radar_pending === undefined && !profile.is_guest) {
      await db.doc(`profiles/${caller.profileId}`).update({ base_radar_pending: true, updated_at: new Date().toISOString() });
      baseRadarPending = true;
    }
    return NextResponse.json({ ok: true, claimed: false, baseRadarPending });
  } catch (err) {
    console.error('[account/registered] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
