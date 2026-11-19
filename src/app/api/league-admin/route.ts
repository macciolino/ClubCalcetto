import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { currentLeague, isLeagueActive, memberCard, scoped } from '@/lib/server/leagueScope';
import { removeLeagueMember, setActivePlayer, setMemberRole, updateLeagueSettings } from '@/lib/server/leagueMembers';
import { checkPromotions } from '@/lib/server/presenceWatch';
import type { LeagueRole } from '@/types/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Multi-league step 3, active league (header x-league-id):
 *  - { action: 'settings', name?, visibility? }  presidents: name and visibility
 *  - { action: 'role', playerId, role }          presidents: PRESIDENT | COLLABORATOR | PLAYER (never without a president)
 *  - { action: 'playing', active }               any member: "Gioco anch'io" on their own card
 *  - { action: 'remove', playerId }              managers: take a member out of THIS league (never the global account)
 */
async function handlePost(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const leagueId = currentLeague();
    const card = await memberCard(caller.uid, leagueId);
    if (!card || card.data.deactivated_at) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    if (!(await isLeagueActive(leagueId))) return NextResponse.json({ ok: false, error: 'suspended' }, { status: 423 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.action === 'playing') {
      await setActivePlayer(leagueId, card.playerId, body.active !== false);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'remove') {
      const role = (card.data.leagueRole as LeagueRole) || 'PLAYER';
      if (role === 'PLAYER') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
      const res = await removeLeagueMember(leagueId, String(body.playerId || ''), { profileId: card.playerId, leagueRole: role });
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.error === 'not_found' ? 404 : 403 });
      // Their places on future days go to the waiting list (notifications to who moves up)
      await Promise.all(res.dates.map((d) => checkPromotions(d).catch(() => undefined)));
      return NextResponse.json({ ok: true });
    }
    if (card.data.leagueRole !== 'PRESIDENT') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    if (body.action === 'settings') {
      const res = await updateLeagueSettings(leagueId, { name: body.name, visibility: body.visibility });
      return NextResponse.json({ ok: res === 'ok', error: res === 'ok' ? undefined : res }, { status: res === 'ok' ? 200 : 400 });
    }
    if (body.action === 'role') {
      const res = await setMemberRole(leagueId, String(body.playerId || ''), body.role, { profileId: caller.profileId, isSuper: caller.isSuper });
      if (res === 'ok') return NextResponse.json({ ok: true });
      return NextResponse.json({ ok: false, error: res }, { status: res === 'not_found' ? 404 : 400 });
    }
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  } catch (err) {
    console.error('[league-admin] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

/** Multi-league: runs in the league the app is using (header x-league-id). */
export const POST = scoped(handlePost);
