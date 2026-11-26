import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { inLeague, leagueDb, leaguesWithPlayer } from '@/lib/server/leagueScope';
import { checkPromotions } from '@/lib/server/presenceWatch';
import { externalPlayerId, externalVoteWindow, outcomeFor } from '@/lib/utils/externalPlayers';
import { externalLevel, type ExternalLevel } from '@/lib/utils/externalLevel';
import { adminProfileIds, sendToProfiles } from '@/lib/server/push';
import type { ExternalSignup, Match } from '@/types/database';
import type { MatchNotice, MySpot, NoticeApplicant } from '@/types/matchNotice';

/**
 * External players in the life of ONE match (docs/ARCHITECTURE.md §3.5). Server only:
 *  - taking a spot adds the person to that day's sign-ups as `ext-<profileId>` (no card in the league);
 *  - removing them or cancelling the notice before the match takes them out (the waiting list moves up);
 *  - after the archive their result (won / drawn / lost, goals, MVP) is copied to THEIR spot, never to the league;
 *  - they vote the MVP of that match through here (they cannot read the league).
 */
export const signupRef = (leagueId: string, date: string, profileId: string) =>
  leagueDb(leagueId).doc(`presences/${date}_${externalPlayerId(profileId)}`);

/** The external players signed up for a day of the current league, as player ids (`ext-<profileId>`). */
export async function externalIdsOfDay(date: string): Promise<string[]> {
  const snap = await leagueDb().collection('presences').where('date', '==', date).get();
  return snap.docs.filter((d) => d.data().external).map((d) => String(d.data().player_id));
}

/**
 * The level an external player brings to ONE match of a league that is not theirs (docs/ARCHITECTURE.md §3.5):
 * the average of the radars confirmed in THEIR leagues plus the quick ratings they got as a guest elsewhere; without any,
 * their Radar Base; without that, the club's neutral 6. Only reads: no card is created, no value of any league changes.
 */
export async function externalLevelFor(profileId: string, hostLeagueId: string): Promise<ExternalLevel & { position?: string }> {
  const db = adminDb();
  const ids = (await leaguesWithPlayer(profileId)).filter((id) => id !== hostLeagueId);
  const [profile, cards, spots] = await Promise.all([
    db.doc(`profiles/${profileId}`).get(),
    ids.length ? db.getAll(...ids.map((id) => leagueDb(id).doc(`players/${profileId}`))) : Promise.resolve([]),
    db.collection(`profiles/${profileId}/spots`).get(),
  ]);
  // Confirmed = a manager reviewed them, or the card predates the review flow (no status): never the UNCONFIRMED ones
  const confirmed = cards
    .map((c) => c.data() || {})
    .filter((c) => c.stats && Object.keys(c.stats).length > 0 && !c.is_guest && !c.removed_at && c.stat_status !== 'UNCONFIRMED');
  const ratings = spots.docs.map((d) => (d.data() as { rating?: { stats?: Record<string, number> } }).rating?.stats).filter((s): s is Record<string, number> => Boolean(s));
  const level = externalLevel({ radar: profile.data()?.baseRadar, confirmedCards: confirmed.map((c) => c.stats as Record<string, number>), ratings });
  return { ...level, position: confirmed.find((c) => c.position)?.position as string | undefined };
}

/** Inside the "take a spot" transaction: the person becomes a sign-up of that day (server time = queue order). */
export function addSignup(tx: Transaction, notice: MatchNotice, who: Omit<ExternalSignup, 'noticeId'>) {
  const id = `${notice.matchId}_${externalPlayerId(who.profileId)}`;
  tx.set(signupRef(notice.leagueId, notice.matchId, who.profileId), {
    id,
    date: notice.matchId,
    player_id: externalPlayerId(who.profileId),
    status: 'confirmed',
    order_index: 0,
    created_at: new Date().toISOString(),
    joined_at: FieldValue.serverTimestamp(),
    external: { ...who, noticeId: notice.id } satisfies ExternalSignup,
  });
}

/** Takes these people out of the match (removed by a manager or notice cancelled) and lets the waiting list move up. */
export async function removeSignups(notice: MatchNotice, profileIds: string[]) {
  if (profileIds.length === 0) return;
  const batch = adminDb().batch();
  profileIds.forEach((id) => batch.delete(signupRef(notice.leagueId, notice.matchId, id)));
  await batch.commit();
  await inLeague(notice.leagueId, () => checkPromotions(notice.matchId)).catch(() => undefined);
}

/**
 * After a match is archived (or its result corrected / deleted): copies each external player's result on their own
 * spot. The league's cards are never touched (profile_effects skip players without a card).
 */
export async function syncExternalResults(leagueId: string, date: string): Promise<number> {
  const db = adminDb();
  const [matchSnap, notices] = await Promise.all([
    leagueDb(leagueId).doc(`matches/${date}`).get(),
    db.collection('match_notices').where('leagueId', '==', leagueId).where('matchId', '==', date).get(),
  ]);
  const match = matchSnap.data() as Match | undefined;
  const done = match?.status === 'completed';
  let n = 0;
  for (const notice of notices.docs) {
    const people = (await notice.ref.collection('applicants').get()).docs.map((d) => d.data() as NoticeApplicant);
    if (people.length === 0) continue;
    const batch = db.batch();
    people.forEach((a) => {
      const o = done ? outcomeFor(match!, externalPlayerId(a.profileId)) : null;
      batch.set(
        db.doc(`profiles/${a.profileId}/spots/${notice.id}`),
        { result: o?.result ?? null, goals: o?.goals ?? 0, mvp: o?.mvp ?? false } satisfies Partial<MySpot>,
        { merge: true }
      );
      n += 1;
    });
    await batch.commit();
  }
  return n;
}

/** What an external player sees of "their" match: the teams (names only), their vote, the vote window, the result. */
export async function matchViewFor(notice: MatchNotice, uid: string) {
  const L = leagueDb(notice.leagueId);
  const [teams, vote, match] = await Promise.all([
    L.doc(`generated_teams/${notice.matchId}`).get(),
    L.doc(`mvp_votes/${notice.matchId}_${uid}`).get(),
    L.doc(`matches/${notice.matchId}`).get(),
  ]);
  const m = match.data() as Match | undefined;
  type Listed = { id: string; name?: string; full_name?: string };
  // Archived: the teams that played; before: the teams made in Squadre (with the external players among them)
  const t = (m?.status === 'completed' ? m : teams.data()) as { team_white?: Listed[]; team_black?: Listed[] } | undefined;
  const names = (list: Listed[] = []) => list.map((p) => ({ id: p.id, name: String(p.name || p.full_name || '') }));
  const window = externalVoteWindow(notice.dateTime);
  return {
    teams: { white: names(t?.team_white), black: names(t?.team_black) },
    myVote: (vote.data()?.player_id as string | undefined) || null,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
    score: m?.status === 'completed' ? { white: m.score_white ?? 0, black: m.score_black ?? 0 } : null,
  };
}

export type VoteError = 'vote_closed' | 'not_candidate';

/** The external player's MVP vote for that match (same doc as the members' votes: one per person, changeable). */
export async function voteMvp(notice: MatchNotice, uid: string, playerId: string, now = Date.now()): Promise<VoteError | null> {
  const { opensAt, closesAt } = externalVoteWindow(notice.dateTime);
  if (now < opensAt || now >= closesAt) return 'vote_closed';
  const view = await matchViewFor(notice, uid);
  const candidates = [...view.teams.white, ...view.teams.black].map((p) => p.id);
  if (!candidates.includes(playerId)) return 'not_candidate';
  await leagueDb(notice.leagueId)
    .doc(`mvp_votes/${notice.matchId}_${uid}`)
    .set({ date: notice.matchId, voter_id: uid, player_id: playerId, updated_at: FieldValue.serverTimestamp() });
  return null;
}

/**
 * Once a match is archived, the managers (and who closed the report) are told ONCE that external players took part and
 * can be rated, quickly and optionally (bell + push; `external_rating_notified_at` on the report). The rating itself
 * is `rateExternal` in matchNotices.ts: it goes in the report and in the person's global radar, never on a league card.
 */
export async function tellUnratedExternals(leagueId: string, date: string): Promise<number> {
  const matchRef = leagueDb(leagueId).doc(`matches/${date}`);
  const match = (await matchRef.get()).data() as (Match & { external_rating_notified_at?: string }) | undefined;
  if (!match || match.status !== 'completed' || match.external_rating_notified_at) return 0;
  const rated = new Set(Object.keys(match.external_ratings || {}));
  const played = new Set([...(match.team_white || []), ...(match.team_black || [])].map((p) => p.id));
  const names = (await externalNamesOfDay(leagueId, date)).filter((e) => played.has(e.id) && !rated.has(e.id)).map((e) => e.name);
  if (names.length === 0) return 0;
  await matchRef.set({ external_rating_notified_at: new Date().toISOString() }, { merge: true });
  const to = Array.from(new Set([...(await inLeague(leagueId, () => adminProfileIds())), ...(match.closed_by ? [match.closed_by] : [])]));
  return sendToProfiles(to, {
    title: '⭐ Valuta gli ospiti',
    body:
      names.length === 1
        ? `${names[0]} ha giocato come ospite: se vuoi, lascia una valutazione rapida (facoltativa).`
        : `${names.join(', ')} hanno giocato come ospiti: se vuoi, lascia una valutazione rapida (facoltativa).`,
    url: '/settings?sezione=partita',
  }).catch(() => 0);
}

async function externalNamesOfDay(leagueId: string, date: string): Promise<{ id: string; name: string }[]> {
  const snap = await leagueDb(leagueId).collection('presences').where('date', '==', date).get();
  return snap.docs.filter((d) => d.data().external).map((d) => ({ id: String(d.data().player_id), name: String(d.data().external.name || 'Ospite') }));
}
