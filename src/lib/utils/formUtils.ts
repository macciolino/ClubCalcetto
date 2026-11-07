import { Match, MvpVote, Profile } from '@/types/database';

/**
 * STATO FORMA (decided with the club owner, 2026-11-07)
 * - Computed on the club's LAST 3 archived matches (temporary: it goes back to 0 by itself).
 * - Points of a player in one match:
 *     official MVP of the match            +1    (switch "MVP")
 *     otherwise MVP votes received, from 2  +0.1 per vote (2 → +0.2, 3 → +0.3, 5 → +0.5)  (switch "MVP")
 *     3 or more goals in the match          +0.5  (switch "Gol")
 *   Wins / defeats do NOT count.
 * - Form = AVERAGE of the points of the last 3 matches (a match not played counts 0), max +1.
 * - The form is added to EVERY parameter and to the OVR (max 10), and is used to balance the teams.
 *   The values written by the admins in the player's card are never changed.
 */
export const FORM_MATCHES = 3;
export const FORM_MAX = 1;
export const FORM_MVP_POINTS = 1;
export const FORM_VOTE_POINTS = 0.1;
export const FORM_MIN_VOTES = 2;
export const FORM_GOALS_MIN = 3;
export const FORM_GOALS_POINTS = 0.5;

export interface FormSettings {
  goals: boolean;
  mvp: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Form of every player (only players with a form > 0 are in the map). */
export function computeForms(
  completedMatches: Match[],
  votesByDate: Record<string, MvpVote[]>,
  settings: FormSettings
): Map<string, number> {
  const forms = new Map<string, number>();
  if (!settings.goals && !settings.mvp) return forms;
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
    if (settings.goals) {
      (m.scorers || []).forEach((s) => {
        if (played.has(s.player_id) && (s.goals || 0) >= FORM_GOALS_MIN) add(s.player_id, FORM_GOALS_POINTS);
      });
    }
  }

  // Media sulle ultime 3 partite del club (se ce ne sono meno di 3, sulle partite che ci sono)
  totals.forEach((sum, id) => {
    const form = Math.min(FORM_MAX, round1(sum / last.length));
    if (form > 0) forms.set(id, form);
  });
  return forms;
}

/** The player with the form added to every parameter and to the OVR (max 10). The original is not changed. */
export function withForm(player: Profile, form: number | undefined): Profile {
  if (!form) return player;
  const stats: Record<string, number> = {};
  Object.entries(player.stats || {}).forEach(([k, v]) => {
    stats[k] = typeof v === 'number' ? Math.min(10, round1(v + form)) : v;
  });
  const base = typeof player.overall_rating === 'number' && player.overall_rating > 0 ? player.overall_rating : 6;
  return { ...player, stats, overall_rating: Math.min(10, round1(base + form)) };
}
