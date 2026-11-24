import { adminDb } from '@/lib/firebase/admin';
import { inLeague, isLeagueActive, isLeagueManager, leagueDb } from '@/lib/server/leagueScope';
import { leagueInviteCode } from '@/lib/server/leagueMembers';
import { addSignup, matchViewFor, removeSignups, voteMvp } from '@/lib/server/externalPlayers';
import { deliverToAdmins, italianDate, sendToProfiles } from '@/lib/server/push';
import { cleanNoticeInput, patchNotice, statusFor } from '@/lib/utils/matchNotice';
import type { MatchNotice, MySpot, NoticeApplicant, NoticeError } from '@/types/matchNotice';

export type { NoticeError };

/**
 * "Bacheca Avvisi / Cerco Giocatore" (`match_notices`, written ONLY here). See docs/ARCHITECTURE.md §3.5.
 *  - presidents and collaborators of the league (and platform staff) create, edit, close and cancel a notice;
 *  - any signed-in user with a verified email takes a spot ("Prendi il posto") in a transaction: never more people
 *    than spots, and the notice closes by itself when the last spot is taken;
 *  - who takes a spot does NOT become a member of the league: no membership, no card, no access to its data;
 *    they get their own copy of the spot (profiles/{id}/spots/{noticeId}), kept in sync, for their career;
 *  - a cancelled notice tells whoever took a spot; after the match a manager can send them the league's invite;
 *  - the person plays THAT match as a sign-up `ext-<profileId>` (lib/server/externalPlayers.ts): teams, report,
 *    MVP (they vote through here); a manager can take them out before the match, freeing the spot.
 */
const NOTICES = 'match_notices';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: NoticeError };

export interface Caller {
  uid: string;
  profileId: string;
  isPlatformStaff: boolean;
  emailVerified: boolean;
}

const fail = (error: NoticeError): { ok: false; error: NoticeError } => ({ ok: false, error });

async function profileName(profileId: string, fallback: string) {
  return String((await adminDb().doc(`profiles/${profileId}`).get()).data()?.full_name || fallback);
}

/** Presidents and collaborators of THAT league (active), or platform staff (also when it is suspended). */
async function canManage(caller: Caller, leagueId: string) {
  return caller.isPlatformStaff || (caller.emailVerified && (await isLeagueManager(caller.uid, leagueId)));
}

/** The person's copy of a spot, from the notice (details kept in sync by every change of the notice). */
function spotFrom(n: MatchNotice, joinedAt: string, status: MySpot['status'] = 'ACTIVE'): MySpot {
  return {
    noticeId: n.id,
    leagueId: n.leagueId,
    leagueName: n.leagueName,
    matchId: n.matchId,
    dateTime: n.dateTime,
    locationName: n.locationName,
    address: n.address,
    format: n.format,
    costPerPlayer: n.costPerPlayer,
    roleNeeded: n.roleNeeded,
    shirtColor: n.shirtColor,
    status,
    joinedAt,
  };
}
const spotRef = (profileId: string, noticeId: string) => adminDb().doc(`profiles/${profileId}/spots/${noticeId}`);

async function applicantsOf(id: string): Promise<NoticeApplicant[]> {
  return (await adminDb().collection(`${NOTICES}/${id}/applicants`).get()).docs.map((d) => d.data() as NoticeApplicant);
}

/** Copies the notice's current details on every applicant's spot (after an edit or a cancellation). */
async function syncSpots(id: string, status: MySpot['status'] = 'ACTIVE') {
  const notice = await loadNotice(id);
  if (!notice) return [];
  const people = await applicantsOf(id);
  if (people.length) {
    const batch = adminDb().batch();
    people.forEach((a) => batch.set(spotRef(a.profileId, id), spotFrom(notice, a.joinedAt, status)));
    await batch.commit();
  }
  return people;
}

async function loadNotice(id: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  const snap = await adminDb().doc(`${NOTICES}/${id}`).get();
  return snap.exists ? ({ ...(snap.data() as MatchNotice), id: snap.id } as MatchNotice) : null;
}

/** New notice of the league for one of its matches. */
export async function createNotice(caller: Caller, leagueId: string, raw: unknown): Promise<Result<{ id: string }>> {
  const league = await adminDb().doc(`leagues/${leagueId}`).get();
  if (!league.exists) return fail('not_found');
  if (!(await canManage(caller, leagueId))) return fail(league.data()?.status === 'suspended' ? 'suspended' : 'forbidden');
  const input = cleanNoticeInput(raw);
  if (!input) return fail('bad_request');
  if (Date.parse(input.dateTime) <= Date.now()) return fail('expired');

  const now = new Date().toISOString();
  const ref = adminDb().collection(NOTICES).doc();
  const notice: Omit<MatchNotice, 'id'> = {
    ...input,
    leagueId,
    leagueName: String(league.data()?.name || leagueId),
    spotsFilled: 0,
    status: 'OPEN',
    createdBy: { profileId: caller.profileId, name: await profileName(caller.profileId, 'Un gestore') },
    created_at: now,
    updated_at: now,
  };
  await ref.set({ id: ref.id, ...notice });
  return { ok: true, id: ref.id };
}

/** A manager changes the details or the spots (never below the spots already taken). */
export async function updateNotice(caller: Caller, id: string, raw: unknown): Promise<Result> {
  const current = await loadNotice(id);
  if (!current) return fail('not_found');
  if (!(await canManage(caller, current.leagueId))) return fail('forbidden');
  if (current.status === 'CANCELLED') return fail('cancelled');
  const input = patchNotice(current, raw);
  if (!input) return fail('bad_request');

  // In a transaction: someone may be taking a spot right now
  const res = await adminDb().runTransaction(async (tx): Promise<Result> => {
    const ref = adminDb().doc(`${NOTICES}/${id}`);
    const fresh = (await tx.get(ref)).data() as MatchNotice;
    if (fresh.status === 'CANCELLED') return fail('cancelled');
    if (input.spotsNeeded < fresh.spotsFilled) return fail('below_filled');
    const next = statusFor(fresh.spotsFilled, input.spotsNeeded, fresh);
    tx.update(ref, { ...input, notes: input.notes ?? '', ...next, closedReason: next.closedReason ?? null, updated_at: new Date().toISOString() });
    return { ok: true } as const;
  });
  // Whoever took a spot sees the new day, time or place in their own list
  if (res.ok) await syncSpots(id);
  return res;
}

/** Closed by hand (stays visible to whoever took a spot) or cancelled (the match will not need anyone). */
export async function setNoticeStatus(caller: Caller, id: string, status: 'CLOSED' | 'CANCELLED'): Promise<Result> {
  const current = await loadNotice(id);
  if (!current) return fail('not_found');
  if (!(await canManage(caller, current.leagueId))) return fail('forbidden');
  if (current.status === 'CANCELLED') return fail('cancelled');
  await adminDb()
    .doc(`${NOTICES}/${id}`)
    .update({ status, closedReason: status === 'CLOSED' ? 'manual' : null, updated_at: new Date().toISOString() });
  if (status === 'CANCELLED') {
    // Whoever took a spot is told at once (bell + push) and the spot is marked as cancelled in their list
    const people = await syncSpots(id, 'CANCELLED');
    // Before the match they also leave its sign-ups (the waiting list moves up); after it, the match is history
    if (Date.parse(current.dateTime) > Date.now()) await removeSignups(current, people.map((a) => a.profileId));
    await sendToProfiles(
      people.map((a) => a.profileId),
      {
        title: '❌ Partita annullata',
        body: `"${current.leagueName}" ha annullato l’avviso per ${italianDate(current.matchId)} (${current.locationName}): il tuo posto non c’è più.`,
        url: '/board',
      }
    ).catch(() => undefined);
  }
  return { ok: true };
}

/**
 * After the match, a manager sends one person who took a spot the league's invite link (bell + push).
 * Joining stays their choice, through the usual invite flow.
 */
export async function inviteApplicant(caller: Caller, id: string, profileId: string): Promise<Result> {
  const notice = await loadNotice(id);
  if (!notice) return fail('not_found');
  if (!(await canManage(caller, notice.leagueId))) return fail('forbidden');
  if (Date.parse(notice.dateTime) > Date.now()) return fail('too_early');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(profileId)) return fail('bad_request');
  const ref = adminDb().doc(`${NOTICES}/${id}/applicants/${profileId}`);
  const applicant = (await ref.get()).data() as NoticeApplicant | undefined;
  if (!applicant) return fail('not_found');
  const member = (await adminDb().doc(`memberships/${applicant.userId}`).get()).data()?.leagues?.[notice.leagueId];
  if (member) return fail('already_member');

  const code = await leagueInviteCode(notice.leagueId, caller.profileId);
  await sendToProfiles([profileId], {
    title: `✉️ Invito in "${notice.leagueName}"`,
    body: `Dopo la partita di ${italianDate(notice.matchId)} la lega ti invita a farne parte. Tocca per entrare.`,
    url: `/join/${code}`,
  });
  await ref.update({ invitedAt: new Date().toISOString() });
  return { ok: true };
}

/**
 * "Prendi il posto": one spot for the caller, atomically (two clicks in the same second never overbook).
 * Refused when the caller already took a spot or is already signed up for that match in that league.
 */
export async function takeSpot(caller: Caller, id: string): Promise<Result<{ spotsFilled: number; status: string }>> {
  if (!caller.emailVerified) return fail('forbidden');
  const notice = await loadNotice(id);
  if (!notice) return fail('not_found');
  if (!(await isLeagueActive(notice.leagueId))) return fail('suspended');

  // Already convened: signed up for that day with their card in that league
  const playerId = (await adminDb().doc(`memberships/${caller.uid}`).get()).data()?.leagues?.[notice.leagueId]?.player_id;
  if (playerId && (await leagueDb(notice.leagueId).doc(`presences/${notice.matchId}_${playerId}`).get()).exists) {
    return fail('already_in_match');
  }
  const account = (await adminDb().doc(`profiles/${caller.profileId}`).get()).data() || {};
  const displayName = String(account.full_name || 'Un giocatore');

  const res = await adminDb().runTransaction(async (tx): Promise<Result<{ spotsFilled: number; status: string }>> => {
    const ref = adminDb().doc(`${NOTICES}/${id}`);
    const mine = ref.collection('applicants').doc(caller.profileId);
    const [snap, already] = await Promise.all([tx.get(ref), tx.get(mine)]);
    const n = snap.data() as MatchNotice;
    if (already.exists) return fail('already_joined');
    if (n.status === 'CANCELLED') return fail('cancelled');
    if (Date.parse(n.dateTime) <= Date.now()) return fail('expired');
    if (n.status !== 'OPEN') return fail(n.spotsFilled >= n.spotsNeeded ? 'full' : 'not_open');
    if (n.spotsFilled >= n.spotsNeeded) return fail('full');

    const spotsFilled = n.spotsFilled + 1;
    const next = statusFor(spotsFilled, n.spotsNeeded, n);
    const now = new Date().toISOString();
    const applicant: NoticeApplicant = { profileId: caller.profileId, userId: caller.uid, displayName, joinedAt: now };
    tx.set(mine, applicant);
    tx.set(spotRef(caller.profileId, id), spotFrom({ ...n, id }, now));
    // The person joins THAT match's sign-ups (a starter, in the teams), without a card in the league
    addSignup(tx, { ...n, id }, {
      profileId: caller.profileId,
      userId: caller.uid,
      name: displayName,
      avatar_url: typeof account.avatar_url === 'string' && account.avatar_url.startsWith('data:image/') ? account.avatar_url : null,
      position: typeof account.position === 'string' ? account.position : undefined,
    });
    tx.update(ref, { spotsFilled, ...next, closedReason: next.closedReason ?? null, updated_at: now });
    return { ok: true, spotsFilled, status: next.status };
  });

  if (res.ok) {
    // The league's managers are told (bell + push), in that league
    const left = notice.spotsNeeded - res.spotsFilled;
    await inLeague(notice.leagueId, () =>
      deliverToAdmins({
        title: left === 0 ? '✅ Avviso completo' : '🙋 Posto preso',
        body: `${displayName} ha preso un posto per ${italianDate(notice.matchId)} (${notice.locationName}). ${
          left === 0 ? 'Tutti i posti sono coperti.' : left === 1 ? 'Manca 1 posto.' : `Mancano ${left} posti.`
        }`,
        url: '/board',
      })
    ).catch(() => undefined);
  }
  return res;
}

/**
 * A manager takes one person out of the match before it starts: the spot is freed (the notice reopens if it had
 * closed because it was full), the sign-up goes, the person is told and their spot reads "removed".
 */
export async function removeApplicant(caller: Caller, id: string, profileId: string): Promise<Result> {
  const notice = await loadNotice(id);
  if (!notice) return fail('not_found');
  if (!(await canManage(caller, notice.leagueId))) return fail('forbidden');
  if (Date.parse(notice.dateTime) <= Date.now()) return fail('too_late');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(profileId)) return fail('bad_request');

  const res = await adminDb().runTransaction(async (tx): Promise<Result<{ applicant: NoticeApplicant }>> => {
    const ref = adminDb().doc(`${NOTICES}/${id}`);
    const mine = ref.collection('applicants').doc(profileId);
    const [snap, who] = await Promise.all([tx.get(ref), tx.get(mine)]);
    if (!who.exists) return fail('not_applicant');
    const n = snap.data() as MatchNotice;
    const spotsFilled = Math.max(0, n.spotsFilled - 1);
    const next = statusFor(spotsFilled, n.spotsNeeded, n);
    tx.delete(mine);
    tx.update(ref, { spotsFilled, ...next, closedReason: next.closedReason ?? null, updated_at: new Date().toISOString() });
    tx.set(spotRef(profileId, id), { status: 'REMOVED' }, { merge: true });
    return { ok: true, applicant: who.data() as NoticeApplicant };
  });
  if (!res.ok) return res;

  await removeSignups(notice, [profileId]);
  await sendToProfiles([profileId], {
    title: '↩️ Posto liberato',
    body: `"${notice.leagueName}" ti ha tolto dalla partita di ${italianDate(notice.matchId)} (${notice.locationName}).`,
    url: '/board',
  }).catch(() => undefined);
  return { ok: true };
}

/** The person who took a spot (or a manager of the league): teams, their MVP vote and the vote window of that match. */
export async function externalMatchView(caller: Caller, id: string) {
  const notice = await loadNotice(id);
  if (!notice) return fail('not_found');
  const isApplicant = (await adminDb().doc(`${NOTICES}/${id}/applicants/${caller.profileId}`).get()).exists;
  if (!isApplicant && !(await canManage(caller, notice.leagueId))) return fail('not_applicant');
  return { ok: true as const, ...(await matchViewFor(notice, caller.uid)) };
}

/** The external player votes the MVP of the match they played (one vote, changeable, in the usual window). */
export async function externalMvpVote(caller: Caller, id: string, playerId: string): Promise<Result> {
  const notice = await loadNotice(id);
  if (!notice) return fail('not_found');
  if (notice.status === 'CANCELLED') return fail('cancelled');
  if (!(await adminDb().doc(`${NOTICES}/${id}/applicants/${caller.profileId}`).get()).exists) return fail('not_applicant');
  if (typeof playerId !== 'string' || !/^[A-Za-z0-9_-]{1,140}$/.test(playerId)) return fail('bad_request');
  const err = await voteMvp(notice, caller.uid, playerId);
  return err ? fail(err) : { ok: true };
}
