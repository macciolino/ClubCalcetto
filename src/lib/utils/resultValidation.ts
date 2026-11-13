import { MatchPenaltySave, MatchScorer, MatchTeamPlayer } from '@/types/database';

/** What the admin enters when closing a match. */
export interface MatchResultValue {
  scoreWhite: number;
  scoreBlack: number;
  mvpPlayerId: string;
  scorers: MatchScorer[];
  /** Fixed goalkeeper only */
  penaltySaves?: MatchPenaltySave[];
}

/**
 * Checks the scorers against the final result.
 * error  → saving is blocked (more scorer goals than goals in the match);
 * warnings → shown but allowed (e.g. own goals make per-team totals differ, or not every goal has a scorer).
 */
export function validateScorers(
  value: MatchResultValue,
  white: MatchTeamPlayer[],
  black: MatchTeamPlayer[]
): { error: string | null; warnings: string[] } {
  const totalGoals = value.scoreWhite + value.scoreBlack;
  const scorerGoals = value.scorers.reduce((acc, s) => acc + (s.goals || 0), 0);
  if (scorerGoals > totalGoals) {
    return {
      error: `I gol dei marcatori (${scorerGoals}) superano i gol del risultato finale (${totalGoals}). Correggi prima di salvare.`,
      warnings: [],
    };
  }
  const warnings: string[] = [];
  const goalsOf = (team: MatchTeamPlayer[]) =>
    value.scorers.filter((s) => team.some((p) => p.id === s.player_id)).reduce((acc, s) => acc + s.goals, 0);
  if (goalsOf(white) > value.scoreWhite) {
    warnings.push(`I marcatori dei Bianchi hanno ${goalsOf(white)} gol ma i Bianchi ne hanno fatti ${value.scoreWhite}.`);
  }
  if (goalsOf(black) > value.scoreBlack) {
    warnings.push(`I marcatori dei Neri hanno ${goalsOf(black)} gol ma i Neri ne hanno fatti ${value.scoreBlack}.`);
  }
  return { error: null, warnings };
}
