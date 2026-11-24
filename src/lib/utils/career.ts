import type { MySpot } from '@/types/matchNotice';

/**
 * "Carriera globale" (profile): the record of every league card of the account plus the matches played as an
 * external through the "Cerco giocatore" board. An external match counts as played from its kick-off and, once the
 * league archives it, with its result, goals and MVP (copied on the person's own spot by the server; never in the
 * league's numbers). Pure: tested in tests/unit/career.test.ts.
 */
export interface LeagueRecord {
  leagueId: string;
  leagueName: string;
  won: number;
  drawn: number;
  lost: number;
}

export interface CareerSummary {
  leagues: (LeagueRecord & { played: number })[];
  totals: { played: number; won: number; drawn: number; lost: number };
  /** Spots taken on the board: played (kick-off passed), upcoming, and the list (newest first, cancelled excluded) */
  external: { played: number; upcoming: number; list: MySpot[]; goals: number; mvp: number };
}

const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

export function careerSummary(records: LeagueRecord[], spots: MySpot[], now: number): CareerSummary {
  const leagues = records
    .map((r) => ({ ...r, won: n(r.won), drawn: n(r.drawn), lost: n(r.lost) }))
    .map((r) => ({ ...r, played: r.won + r.drawn + r.lost }))
    .sort((a, b) => b.played - a.played || a.leagueName.localeCompare(b.leagueName));
  const list = spots.filter((s) => s.status === 'ACTIVE').sort((a, b) => b.dateTime.localeCompare(a.dateTime));
  const playedOut = list.filter((s) => Date.parse(s.dateTime) <= now).length;
  const ext = (r: 'won' | 'drawn' | 'lost') => list.filter((s) => s.result === r).length;
  const sum = (k: 'won' | 'drawn' | 'lost') => leagues.reduce((t, r) => t + r[k], 0) + ext(k);
  return {
    leagues,
    totals: { played: leagues.reduce((t, r) => t + r.played, 0) + playedOut, won: sum('won'), drawn: sum('drawn'), lost: sum('lost') },
    external: {
      played: playedOut,
      upcoming: list.length - playedOut,
      list,
      goals: list.reduce((t, s) => t + n(s.goals), 0),
      mvp: list.filter((s) => s.mvp).length,
    },
  };
}

/** One line of the personal history: a match of one of the person's leagues, or one played as an external. */
export interface HistoryEntry {
  key: string;
  date: string;
  leagueId: string;
  leagueName: string;
  /** Played as an external through the board ("Ospite · Lega") */
  external: boolean;
  result: 'won' | 'drawn' | 'lost' | null;
  score: { white: number; black: number } | null;
  goals: number;
  mvp: boolean;
}

/**
 * Personal history across leagues (newest first): the archived matches the person played in their leagues (already
 * worked out per league) + the external matches whose kick-off has passed (with a result once archived).
 */
export function personalHistory(leagueEntries: HistoryEntry[], spots: MySpot[], now: number): HistoryEntry[] {
  const external: HistoryEntry[] = spots
    .filter((s) => s.status === 'ACTIVE' && Date.parse(s.dateTime) <= now)
    .map((s) => ({
      key: `ext:${s.noticeId}`,
      date: s.matchId,
      leagueId: s.leagueId,
      leagueName: s.leagueName,
      external: true,
      result: s.result ?? null,
      score: null,
      goals: n(s.goals),
      mvp: Boolean(s.mvp),
    }));
  return [...leagueEntries, ...external].sort((a, b) => b.date.localeCompare(a.date) || a.leagueName.localeCompare(b.leagueName));
}
