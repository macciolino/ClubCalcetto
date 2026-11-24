import type { MySpot } from '@/types/matchNotice';

/**
 * "Carriera globale" (profile): the record of every league card of the account plus the matches played as an
 * external through the "Cerco giocatore" board. External matches count as played, without a result (the person
 * is not in the league's teams). Pure: tested in tests/unit/career.test.ts.
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
  external: { played: number; upcoming: number; list: MySpot[] };
}

const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

export function careerSummary(records: LeagueRecord[], spots: MySpot[], now: number): CareerSummary {
  const leagues = records
    .map((r) => ({ ...r, won: n(r.won), drawn: n(r.drawn), lost: n(r.lost) }))
    .map((r) => ({ ...r, played: r.won + r.drawn + r.lost }))
    .sort((a, b) => b.played - a.played || a.leagueName.localeCompare(b.leagueName));
  const list = spots.filter((s) => s.status === 'ACTIVE').sort((a, b) => b.dateTime.localeCompare(a.dateTime));
  const playedOut = list.filter((s) => Date.parse(s.dateTime) <= now).length;
  const sum = (k: 'won' | 'drawn' | 'lost') => leagues.reduce((t, r) => t + r[k], 0);
  return {
    leagues,
    totals: { played: leagues.reduce((t, r) => t + r.played, 0) + playedOut, won: sum('won'), drawn: sum('drawn'), lost: sum('lost') },
    external: { played: playedOut, upcoming: list.length - playedOut, list },
  };
}
