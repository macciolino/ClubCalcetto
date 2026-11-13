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

/** Structured problem, so the UI can show it in any language. */
export type ScorerIssue =
  | { kind: 'tooMany'; scorerGoals: number; totalGoals: number }
  | { kind: 'teamExcess'; team: 'white' | 'black'; scorerGoals: number; teamGoals: number };

/**
 * Checks the scorers against the final result.
 * error  → saving is blocked (more scorer goals than goals in the match);
 * warnings → shown but allowed (e.g. own goals make per-team totals differ, or not every goal has a scorer).
 */
export function validateScorers(
  value: MatchResultValue,
  white: MatchTeamPlayer[],
  black: MatchTeamPlayer[]
): { error: string | null; warnings: string[]; issues: { error: ScorerIssue | null; warnings: ScorerIssue[] } } {
  const totalGoals = value.scoreWhite + value.scoreBlack;
  const scorerGoals = value.scorers.reduce((acc, s) => acc + (s.goals || 0), 0);
  if (scorerGoals > totalGoals) {
    return {
      error: `I gol dei marcatori (${scorerGoals}) superano i gol del risultato finale (${totalGoals}). Correggi prima di salvare.`,
      warnings: [],
      issues: { error: { kind: 'tooMany', scorerGoals, totalGoals }, warnings: [] },
    };
  }
  const warnings: string[] = [];
  const issues: ScorerIssue[] = [];
  const goalsOf = (team: MatchTeamPlayer[]) =>
    value.scorers.filter((s) => team.some((p) => p.id === s.player_id)).reduce((acc, s) => acc + s.goals, 0);
  if (goalsOf(white) > value.scoreWhite) {
    warnings.push(`I marcatori dei Bianchi hanno ${goalsOf(white)} gol ma i Bianchi ne hanno fatti ${value.scoreWhite}.`);
    issues.push({ kind: 'teamExcess', team: 'white', scorerGoals: goalsOf(white), teamGoals: value.scoreWhite });
  }
  if (goalsOf(black) > value.scoreBlack) {
    warnings.push(`I marcatori dei Neri hanno ${goalsOf(black)} gol ma i Neri ne hanno fatti ${value.scoreBlack}.`);
    issues.push({ kind: 'teamExcess', team: 'black', scorerGoals: goalsOf(black), teamGoals: value.scoreBlack });
  }
  return { error: null, warnings, issues: { error: null, warnings: issues } };
}
