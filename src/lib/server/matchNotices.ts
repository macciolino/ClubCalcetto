import { adminDb } from '@/lib/firebase/admin';
import { inLeague, isLeagueActive, isLeagueManager, leagueDb } from '@/lib/server/leagueScope';
import { deliverToAdmins, italianDate } from '@/lib/server/push';
import { cleanNoticeInput, patchNotice, statusFor } from '@/lib/utils/matchNotice';
import type { MatchNotice, NoticeApplicant, NoticeError } from '@/types/matchNotice';

export type { NoticeError };

/**
 * "Bacheca Avvisi / Cerco Giocatore" (`match_notices`, written ONLY here). See docs/ARCHITECTURE.md §3.5.
 *  - presidents and collaborators of the league (and platform staff) create, edit, close and cancel a notice;
 *  - any signed-in user with a verified email takes a spot ("Prendi il posto") in a transaction: never more people
 *    than spots, and the notice closes by itself when the last spot is taken;
 *  - who takes a spot does NOT become a member of the league: no membership, no card, no access to its data.
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
  return adminDb().runTransaction(async (tx) => {
    const ref = adminDb().doc(`${NOTICES}/${id}`);
    const fresh = (await tx.get(ref)).data() as MatchNotice;
    if (fresh.status === 'CANCELLED') return fail('cancelled');
    if (input.spotsNeeded < fresh.spotsFilled) return fail('below_filled');
    const next = statusFor(fresh.spotsFilled, input.spotsNeeded, fresh);
    tx.update(ref, { ...input, notes: input.notes ?? '', ...next, closedReason: next.closedReason ?? null, updated_at: new Date().toISOString() });
    return { ok: true } as const;
  });
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
  const displayName = await profileName(caller.profileId, 'Un giocatore');

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
