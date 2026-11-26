import { adminDb } from '@/lib/firebase/admin';
import { deliverToAdmins } from '@/lib/server/push';
import { ensureLeagueCard, isMemberOf } from '@/lib/server/leagueMembers';
import { inLeague, leagueDb } from '@/lib/server/leagueScope';
import { MATCH_FORMATS } from '@/lib/utils/matchFormat';
import { MIN_PLAYERS_FOR_AVERAGE, averageOverall, prevailingFormat, type PublicLeague } from '@/lib/utils/publicLeagues';
import type { MatchFormat } from '@/types/database';

/**
 * Public leagues (`visibility: 'public'`): shown to someone who belongs to no league, who can join them directly.
 * Server only: the rules do not let a non-member read a league. docs/ARCHITECTURE.md ("Registrazione e Radar Base").
 */
const MAX_LEAGUES = 30;
// 5 minutes; `PUBLIC_LEAGUES_CACHE_MS=0` turns the cache off (the end-to-end tests reseed the data between tests)
const CACHE_MS = Number(process.env.PUBLIC_LEAGUES_CACHE_MS ?? 5 * 60 * 1000);
let cache: { at: number; list: PublicLeague[] } | null = null;

/** A card that is really in the league and plays (not taken out, closed, archived or "just organising"). */
const plays = (d: FirebaseFirestore.DocumentData) => !d.removed_at && !d.deactivated_at && !d.archived_at && d.isActivePlayer !== false;

async function describeLeague(id: string, data: FirebaseFirestore.DocumentData): Promise<PublicLeague> {
  const L = leagueDb(id);
  const [players, matches] = await Promise.all([
    L.collection('players').select('overall_rating', 'isActivePlayer', 'removed_at', 'deactivated_at', 'archived_at').get(),
    L.collection('matches').where('status', '==', 'completed').select('format', 'team_white', 'team_black').get(),
  ]);
  const active = players.docs.map((d) => d.data()).filter(plays);
  const fallback: MatchFormat = MATCH_FORMATS.includes(data.defaultFormat) ? data.defaultFormat : '5v5';
  return {
    id,
    name: String(data.name || id),
    format: prevailingFormat(
      matches.docs.map((m) => {
        const d = m.data();
        return { format: d.format, players: (Array.isArray(d.team_white) ? d.team_white.length : 0) + (Array.isArray(d.team_black) ? d.team_black.length : 0) };
      }),
      fallback
    ),
    avgOverall: averageOverall(active.map((p) => Number(p.overall_rating))),
    players: active.length,
    matches: matches.size,
  };
}

/** Every active public league (a short cache: it costs a read per card and match of each league). */
export async function publicLeagues(now = Date.now()): Promise<PublicLeague[]> {
  if (CACHE_MS > 0 && cache && now - cache.at < CACHE_MS) return cache.list;
  const snap = await adminDb().collection('leagues').where('visibility', '==', 'public').where('status', '==', 'active').limit(MAX_LEAGUES).get();
  const list = await Promise.all(snap.docs.map((d) => describeLeague(d.id, d.data())));
  list.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  cache = { at: now, list };
  return list;
}

/** For tests: forget the cached list. */
export function resetPublicLeaguesCache() {
  cache = null;
}

/** The public leagues this account is not in yet. */
export async function publicLeaguesFor(uid: string): Promise<PublicLeague[]> {
  const memberships = (await adminDb().doc(`memberships/${uid}`).get()).data()?.leagues || {};
  return (await publicLeagues()).filter((l) => !memberships[l.id]);
}

export type JoinPublicResult = { ok: true; leagueId: string; already?: boolean } | { ok: false; error: 'not_public' };

/**
 * Joins a public league directly (no invite, no approval: the president made it public): a new card that starts from the
 * account's Radar Base, with the values UNCONFIRMED until a president or collaborator approves them after the first
 * match. The managers are told. A private, suspended or missing league is refused with the same answer.
 */
export async function joinPublicLeague(caller: { uid: string; profileId: string }, leagueId: string): Promise<JoinPublicResult> {
  if (typeof leagueId !== 'string' || !/^[A-Za-z0-9_-]{2,80}$/.test(leagueId)) return { ok: false, error: 'not_public' };
  const league = (await adminDb().doc(`leagues/${leagueId}`).get()).data();
  if (!league || league.status !== 'active' || league.visibility !== 'public') return { ok: false, error: 'not_public' };
  if (await isMemberOf(caller.uid, leagueId)) return { ok: true, leagueId, already: true };
  const created = await ensureLeagueCard(leagueId, caller, String(league.name || ''));
  if (created) {
    const name = String((await adminDb().doc(`profiles/${caller.profileId}`).get()).data()?.full_name || 'Un giocatore');
    await inLeague(leagueId, () =>
      deliverToAdmins({
        title: '🙋 Nuovo giocatore in lega',
        body: `${name} è entrato nella lega pubblica. I suoi valori partono dal suo Radar Base: confermali dopo la prima partita.`,
        url: '/players',
      })
    ).catch(() => undefined);
  }
  cache = null; // the number of players changed
  return { ok: true, leagueId };
}

export { MIN_PLAYERS_FOR_AVERAGE };
