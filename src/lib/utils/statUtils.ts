import { Match, StatCategory, STAT_DETAILS } from '@/types/database';

/**
 * 'Tecnica' was replaced by 'Visione'. Old data is NOT rewritten:
 *  - a 'Tecnica' category is shown as 'Visione' (same id), or hidden if 'Visione' already exists;
 *  - a player without a 'Visione' value shows their old 'Tecnica' value (see getStatValue).
 */
export function normalizeCategories(categories: StatCategory[]): StatCategory[] {
  const hasVisione = categories.some((c) => c.name === 'Visione');
  return categories
    .filter((c) => !(hasVisione && c.name === 'Tecnica'))
    .map((c) =>
      c.name === 'Tecnica'
        ? { ...c, name: 'Visione', label: STAT_DETAILS.Visione?.label || 'Visione di gioco / Tattica' }
        : c
    );
}

/** Value of a stat for a player, with the Tecnica -> Visione fallback and a default. */
export function getStatValue(
  stats: Record<string, number> | undefined | null,
  name: string,
  fallback = 6
): number {
  const v = stats?.[name] ?? (name === 'Visione' ? stats?.Tecnica : undefined);
  return typeof v === 'number' ? v : fallback;
}

export interface PlayerMatchStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals: number;
  mvp: number;
}

export const EMPTY_MATCH_STATS: PlayerMatchStats = { played: 0, won: 0, drawn: 0, lost: 0, goals: 0, mvp: 0 };

/** Statistics of every player from the ARCHIVED matches (same numbers as the Storico leaderboard). */
export function computeMatchStats(completedMatches: Match[]): Map<string, PlayerMatchStats> {
  const map = new Map<string, PlayerMatchStats>();
  const of = (id: string) => {
    let st = map.get(id);
    if (!st) {
      st = { ...EMPTY_MATCH_STATS };
      map.set(id, st);
    }
    return st;
  };
  for (const m of completedMatches) {
    const w = m.score_white ?? 0;
    const b = m.score_black ?? 0;
    (['white', 'black'] as const).forEach((team) => {
      ((team === 'white' ? m.team_white : m.team_black) || []).forEach((p) => {
        const st = of(p.id);
        st.played += 1;
        if (w === b) st.drawn += 1;
        else if ((team === 'white') === w > b) st.won += 1;
        else st.lost += 1;
      });
    });
    (m.scorers || []).forEach((sc) => (of(sc.player_id).goals += sc.goals || 0));
    if (m.mvp_player_id) of(m.mvp_player_id).mvp += 1;
  }
  return map;
}

/** For each player, the results of their last `n` archived matches, newest first. */
export function computeRecentResults(completedMatches: Match[], n = 5): Map<string, ('won' | 'drawn' | 'lost')[]> {
  const map = new Map<string, ('won' | 'drawn' | 'lost')[]>();
  const sorted = [...completedMatches].sort((a, b) => (b.match_date || b.id).localeCompare(a.match_date || a.id));
  for (const m of sorted) {
    const w = m.score_white ?? 0;
    const b = m.score_black ?? 0;
    (['white', 'black'] as const).forEach((team) => {
      ((team === 'white' ? m.team_white : m.team_black) || []).forEach((p) => {
        const list = map.get(p.id) || [];
        if (list.length >= n) return;
        list.push(w === b ? 'drawn' : (team === 'white') === w > b ? 'won' : 'lost');
        map.set(p.id, list);
      });
    });
  }
  return map;
}
