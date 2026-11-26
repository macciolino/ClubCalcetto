import { FORMAT_INFO, MATCH_FORMATS } from '@/lib/utils/matchFormat';
import type { MatchFormat } from '@/types/database';

/**
 * The public leagues shown to someone who belongs to no league yet (docs/ARCHITECTURE.md): name, usual format, average
 * level of the players and matches played. Shared by the server (which builds them) and the app (which shows them).
 */
export interface PublicLeague {
  id: string;
  name: string;
  /** The format most of its matches are played in */
  format: MatchFormat;
  /** Average OVR (1–10) of the players, null when there are not enough players yet ("Nuova lega") */
  avgOverall: number | null;
  /** Players of the league (those who play, guests included) */
  players: number;
  /** Archived matches */
  matches: number;
}

/** Below this many players the average level says nothing: the league reads "Nuova lega". */
export const MIN_PLAYERS_FOR_AVERAGE = 6;

/** The format whose number of players is closest to this match's (teams of 10 → 5vs5, 14 → 7vs7…). */
export function formatForPlayers(total: number): MatchFormat {
  return MATCH_FORMATS.reduce((best, f) => (Math.abs(FORMAT_INFO[f].players - total) < Math.abs(FORMAT_INFO[best].players - total) ? f : best), MATCH_FORMATS[0]);
}

/** The most frequent format among the matches (a tie goes to the smaller format); `fallback` without matches. */
export function prevailingFormat(matches: { format?: unknown; players?: number }[], fallback: MatchFormat = '5v5'): MatchFormat {
  const count = new Map<MatchFormat, number>();
  matches.forEach((m) => {
    const known = MATCH_FORMATS.find((f) => f === m.format);
    const f = known ?? (m.players ? formatForPlayers(m.players) : null);
    if (f) count.set(f, (count.get(f) || 0) + 1);
  });
  if (count.size === 0) return fallback;
  let best: MatchFormat = MATCH_FORMATS.find((f) => count.has(f)) as MatchFormat;
  MATCH_FORMATS.forEach((f) => {
    if ((count.get(f) || 0) > (count.get(best) || 0)) best = f;
  });
  return best;
}

/** Average OVR of the players with a level, null when they are fewer than `MIN_PLAYERS_FOR_AVERAGE`. */
export function averageOverall(ratings: (number | null | undefined)[]): number | null {
  const valid = ratings.filter((r): r is number => typeof r === 'number' && r > 0);
  if (valid.length < MIN_PLAYERS_FOR_AVERAGE) return null;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1));
}
