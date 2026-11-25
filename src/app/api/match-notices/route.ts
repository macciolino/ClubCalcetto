import { NextResponse } from 'next/server';
import { isAdminConfigured } from '@/lib/firebase/admin';
import { callerFrom } from '@/lib/server/adminRequests';
import { currentLeague, scoped } from '@/lib/server/leagueScope';
import {
  createNotice,
  externalMatchView,
  externalMvpVote,
  inviteApplicant,
  removeApplicant,
  leaveSpot,
  setNoticeStatus,
  takeSpot,
  updateNotice,
  type NoticeError,
} from '@/lib/server/matchNotices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Bacheca Avvisi / Cerco Giocatore". See docs/ARCHITECTURE.md §3.5. The board itself is read from Firestore
 * (match_notices, status OPEN); every write goes through here.
 * POST:
 *   { action: 'create', notice }          presidents, collaborators of the ACTIVE league (x-league-id), staff
 *   { action: 'update', id, notice }      managers of the notice's league, staff (partial: only editable fields)
 *   { action: 'close', id }               managers, staff: no more spots on offer
 *   { action: 'cancel', id }              managers, staff: the notice is withdrawn
 *   { action: 'take', id }                any signed-in user with a verified email: takes one spot (transaction)
 *   { action: 'invite', id, profileId }   managers, staff, after the match: sends that person the league's invite
 *   { action: 'remove', id, profileId }   managers, staff, before the match: takes that person out, frees the spot
 *   { action: 'leave', id }               who took a spot: gives it back before the match (frees it, notifies managers)
 *   { action: 'match_view', id }          who took a spot (or managers): teams, own MVP vote, vote window, score
 *   { action: 'mvp_vote', id, playerId }  who took a spot: votes the MVP of that match, in the vote window
 */
const STATUS: Record<NoticeError, number> = {
  bad_request: 400,
  not_found: 404,
  forbidden: 403,
  suspended: 423,
  not_open: 409,
  cancelled: 409,
  expired: 409,
  full: 409,
  already_joined: 409,
  already_in_match: 409,
  is_member: 409,
  below_filled: 400,
  too_early: 409,
  already_member: 409,
  too_late: 409,
  not_applicant: 403,
  vote_closed: 409,
  not_candidate: 400,
};

async function handlePost(request: Request) {
  if (!isAdminConfigured()) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const caller = await callerFrom(request);
    if (!caller) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';

    let res;
    switch (body.action) {
      case 'create':
        res = await createNotice(caller, currentLeague(), body.notice);
        break;
      case 'update':
        res = await updateNotice(caller, id, body.notice);
        break;
      case 'close':
        res = await setNoticeStatus(caller, id, 'CLOSED');
        break;
      case 'cancel':
        res = await setNoticeStatus(caller, id, 'CANCELLED');
        break;
      case 'take':
        res = await takeSpot(caller, id);
        break;
      case 'invite':
        res = await inviteApplicant(caller, id, typeof body.profileId === 'string' ? body.profileId : '');
        break;
      case 'remove':
        res = await removeApplicant(caller, id, typeof body.profileId === 'string' ? body.profileId : '');
        break;
      case 'leave':
        res = await leaveSpot(caller, id);
        break;
      case 'match_view':
        res = await externalMatchView(caller, id);
        break;
      case 'mvp_vote':
        res = await externalMvpVote(caller, id, typeof body.playerId === 'string' ? body.playerId : '');
        break;
      default:
        return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }
    return res.ok ? NextResponse.json(res) : NextResponse.json(res, { status: STATUS[res.error] });
  } catch (err) {
    console.error('[match-notices] errore:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}

/** Creation works on the league the app is using (header x-league-id); the other actions on the notice's league. */
export const POST = scoped(handlePost);
