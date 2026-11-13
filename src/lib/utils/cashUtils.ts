import { GeneratedTeamRecord, Match, MatchPaymentRecord, MatchTeamPlayer } from '@/types/database';
import { reconcileTeams, toTeamPlayer } from '@/lib/utils/teamUtils';

/** Where the list of who pays comes from. */
export type CashSource = 'archive' | 'teams' | 'starters';

/**
 * Who pays for a match (Partita della settimana → Cassa):
 *  1. archived match → the players of its archived teams (frozen list, like the history);
 *  2. teams saved in Squadre → their players (before the match date with substitutions, from the date as saved),
 *     even if a team is incomplete;
 *  3. no teams → the starters signed up for that day.
 * Duplicates (same id twice) are removed.
 */
export function cashPayers(input: {
  date: string;
  today: string;
  archivedMatch?: Pick<Match, 'team_white' | 'team_black'> | null;
  teamRecord?: Pick<GeneratedTeamRecord, 'team_white' | 'team_black'> | null;
  starters: MatchTeamPlayer[];
}): { source: CashSource; payers: MatchTeamPlayer[] } {
  const { date, today, archivedMatch, teamRecord, starters } = input;
  const unique = (list: MatchTeamPlayer[]) => Array.from(new Map(list.map((p) => [p.id, { id: p.id, name: p.name }])).values());
  if (archivedMatch?.team_white?.length || archivedMatch?.team_black?.length) {
    return { source: 'archive', payers: unique([...(archivedMatch.team_white || []), ...(archivedMatch.team_black || [])]) };
  }
  if (teamRecord?.team_white?.length || teamRecord?.team_black?.length) {
    if (date < today) {
      return { source: 'teams', payers: unique([...(teamRecord.team_white || []), ...(teamRecord.team_black || [])].map(toTeamPlayer)) };
    }
    const r = reconcileTeams(teamRecord, starters);
    return { source: 'teams', payers: unique([...r.white, ...r.black]) };
  }
  return { source: 'starters', payers: unique(starters) };
}

/**
 * How many people the cost is divided by: with teams (saved or archived) the players who actually play;
 * with only sign-ups, the places of the format (10, 14, 16, 22), so the quota does not jump while people sign up.
 */
export function cashHeadCount(source: CashSource, payersCount: number, formatPlayers: number): number {
  return source === 'starters' ? Math.max(1, formatPlayers) : Math.max(1, payersCount);
}

/** Summary of the Cassa: who paid, who is missing, money in, progress bar (0–100). */
export function cashSummary(
  payers: { id: string; name: string }[],
  payments: Pick<MatchPaymentRecord, 'payments'>,
  totalCost: number,
  headCount: number
): { paidCount: number; unpaid: { id: string; name: string }[]; quota: number; collected: number; progress: number } {
  const quota = Number(totalCost || 0) / Math.max(1, headCount);
  const paidCount = payers.filter((p) => payments.payments?.[p.id] === true).length;
  const unpaid = payers.filter((p) => payments.payments?.[p.id] !== true);
  return {
    paidCount,
    unpaid,
    quota,
    collected: paidCount * quota,
    progress: payers.length ? Math.round((paidCount / Math.max(headCount, payers.length)) * 100) : 0,
  };
}
