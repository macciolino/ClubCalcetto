import { Match, MvpVote, Profile } from '@/types/database';

/**
 * STATO FORMA (decided with the club owner, 2026-11-07)
 * - Computed on the club's LAST 3 archived matches (temporary: it goes back to 0 by itself).
 * - Points of a player in one match:
 *     official MVP of the match            +1    (switch "MVP")
 *     otherwise MVP votes received, from 2  +0.1 per vote (2 → +0.2, 3 → +0.3, 5 → +0.5)  (switch "MVP")
 *     2 or more goals in the match          +0.5  (switch "Gol")
 *       a Difensore (and, with a fixed goalkeeper, the Portiere) gets it from the FIRST goal
 *     penalty saved (fixed goalkeeper only)  +0.3 each, max +0.6 per match  (switch "Gol")
 *     win +0.2 · draw 0 · defeat -0.2, for all 5 of the team, whatever the score margin
 *                                           (switch "Vittorie e sconfitte"; MVP / votes / goals compensate)
 * - Form = AVERAGE of the points of the last 3 matches (a match not played counts 0), from -1 to +1.
 * - The form is added to EVERY parameter and to the OVR (between 1 and 10), and is used to balance the teams.
 *   The values written by the admins in the player's card are never changed.
 */
export const FORM_MATCHES = 3;
export const FORM_MAX = 1;
export const FORM_MVP_POINTS = 1;
export const FORM_VOTE_POINTS = 0.1;
export const FORM_MIN_VOTES = 2;
export const FORM_GOALS_MIN = 2;
export const FORM_GOALS_POINTS = 0.5;
/** Defenders (and fixed goalkeepers) get the goal bonus from this many goals */
export const FORM_GOALS_MIN_DEFENDER = 1;
export const FORM_PENALTY_SAVE_POINTS = 0.3;
export const FORM_PENALTY_SAVE_MAX = 0.6;
export const FORM_WIN_POINTS = 0.2;
export const FORM_LOSS_POINTS = -0.2;

export interface FormSettings {
  goals: boolean;
  mvp: boolean;
  results: boolean;
  /** true = the club plays with a fixed goalkeeper (goalkeeper goals from 1, penalty saves count) */
  fixedKeeper?: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Form of every player (only players with a form > 0 are in the map). */
export function computeForms(
  completedMatches: Match[],
  votesByDate: Record<string, MvpVote[]>,
  settings: FormSettings,
  /** Role of each player (profile.position): a 'Difensore' needs only 1 goal for the goal bonus */
  positions: Record<string, string | undefined> = {}
): Map<string, number> {
  const forms = new Map<string, number>();
  if (!settings.goals && !settings.mvp && !settings.results) return forms;
  const last = [...completedMatches]
    .filter((m) => m.status === 'completed')
    .sort((a, b) => (b.match_date || b.id).localeCompare(a.match_date || a.id))
    .slice(0, FORM_MATCHES);
  if (last.length === 0) return forms;

  const totals = new Map<string, number>();
  const add = (id: string, n: number) => totals.set(id, (totals.get(id) || 0) + n);

  for (const m of last) {
    const date = m.match_date || m.id;
    const played = new Set([...(m.team_white || []), ...(m.team_black || [])].map((p) => p.id));
    if (settings.mvp) {
      const votes = new Map<string, number>();
      (votesByDate[date] || []).forEach((v) => votes.set(v.player_id, (votes.get(v.player_id) || 0) + 1));
      played.forEach((id) => {
        if (m.mvp_player_id === id) add(id, FORM_MVP_POINTS);
        else if ((votes.get(id) || 0) >= FORM_MIN_VOTES) add(id, (votes.get(id) || 0) * FORM_VOTE_POINTS);
      });
    }
    if (settings.results) {
      const w = m.score_white ?? 0;
      const b = m.score_black ?? 0;
      if (w !== b) {
        const winners = w > b ? m.team_white : m.team_black;
        const losers = w > b ? m.team_black : m.team_white;
        (winners || []).forEach((p) => add(p.id, FORM_WIN_POINTS));
        (losers || []).forEach((p) => add(p.id, FORM_LOSS_POINTS));
      }
    }
    if (settings.goals) {
      (m.scorers || []).forEach((s) => {
        const role = positions[s.player_id];
        const lowBar = role === 'Difensore' || (settings.fixedKeeper && role === 'Portiere');
        const min = lowBar ? FORM_GOALS_MIN_DEFENDER : FORM_GOALS_MIN;
        if (played.has(s.player_id) && (s.goals || 0) >= min) add(s.player_id, FORM_GOALS_POINTS);
      });
      if (settings.fixedKeeper) {
        (m.penalty_saves || []).forEach((ps) => {
          if (played.has(ps.player_id) && ps.count > 0) {
            add(ps.player_id, Math.min(FORM_PENALTY_SAVE_MAX, ps.count * FORM_PENALTY_SAVE_POINTS));
          }
        });
      }
    }
  }

  // Media sulle ultime 3 partite del club (se ce ne sono meno di 3, sulle partite che ci sono)
  totals.forEach((sum, id) => {
    const form = Math.max(-FORM_MAX, Math.min(FORM_MAX, round1(sum / last.length)));
    if (form !== 0) forms.set(id, form);
  });
  return forms;
}

const clamp = (n: number) => Math.max(1, Math.min(10, round1(n)));

/** "+0,5" / "−0,2" for the screens */
export function formatForm(form: number): string {
  return `${form > 0 ? '+' : '−'}${String(Math.abs(form)).replace('.', ',')}`;
}

/** The player with the form added to every parameter and to the OVR (between 1 and 10). The original is not changed. */
export function withForm(player: Profile, form: number | undefined): Profile {
  if (!form) return player;
  const stats: Record<string, number> = {};
  Object.entries(player.stats || {}).forEach(([k, v]) => {
    stats[k] = typeof v === 'number' ? clamp(v + form) : v;
  });
  const base = typeof player.overall_rating === 'number' && player.overall_rating > 0 ? player.overall_rating : 6;
  return { ...player, stats, overall_rating: clamp(base + form) };
}
