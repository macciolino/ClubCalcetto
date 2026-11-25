import type { MatchTeamPlayer } from '@/types/database';

/**
 * A past match entered by hand in the Storico (forgotten, or written on paper before using the app). Pure rules of
 * the form; the match is then saved like any archived match (saveMatchResult: W/D/L on the cards, leaderboard, form).
 * Tested in tests/unit/manualMatch.test.ts.
 */
export type ManualMatchError = 'date_required' | 'future' | 'exists' | 'teams_empty' | 'too_many' | 'duplicate';

export function manualMatchError(input: {
  date: string;
  today: string;
  /** Days that already have an archived match (one match per day in a league) */
  archivedDates: Set<string>;
  white: MatchTeamPlayer[];
  black: MatchTeamPlayer[];
  perTeam: number;
}): ManualMatchError | null {
  const { date, today, archivedDates, white, black, perTeam } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'date_required';
  if (date > today) return 'future';
  if (archivedDates.has(date)) return 'exists';
  if (white.length === 0 || black.length === 0) return 'teams_empty';
  if (white.length > perTeam || black.length > perTeam) return 'too_many';
  if (new Set([...white, ...black].map((p) => p.id)).size !== white.length + black.length) return 'duplicate';
  return null;
}

/** Id of a guest created on the fly while entering a paper match (same shape as the guests made in Giocatori). */
export const newGuestId = (n: number) => `guest-${Date.now()}-${n}`;
