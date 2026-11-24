import type { ExternalSignup, Match, MatchOutcome, Presence, Profile } from '@/types/database';

/**
 * External players ("Spot", docs/ARCHITECTURE.md §3.5): someone who took a spot on the board plays ONE match of a
 * league without a card there. They join that day as a sign-up with player id `ext-<profileId>` (written only by
 * the server), so they are starters, in the teams, in the report and among the MVP candidates; the league's
 * statistics skip every `ext-` id and their result goes only to their own career. Pure: tests/unit/externalPlayers.test.ts.
 */
export const EXTERNAL_PREFIX = 'ext-';

export const externalPlayerId = (profileId: string) => `${EXTERNAL_PREFIX}${profileId}`;
export const isExternalId = (id: string | null | undefined) => typeof id === 'string' && id.startsWith(EXTERNAL_PREFIX);

/**
 * The player shown for an external sign-up in the league's views (Presenze, Squadre, Partita): a plain player at
 * the club's default level (their parameters belong to their own leagues), marked as external.
 */
export function externalProfile(presence: Pick<Presence, 'player_id'> & { external?: ExternalSignup }): Profile | undefined {
  const e = presence.external;
  if (!e) return undefined;
  return {
    id: presence.player_id,
    user_id: e.userId,
    full_name: e.name,
    avatar_url: e.avatar_url ?? null,
    role: 'player',
    position: (e.position as Profile['position']) || 'Esterno',
    is_guest: false,
    is_external: true,
    stats: {},
    overall_rating: 6,
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    created_at: '',
    updated_at: '',
  } as Profile;
}

/** How an archived match went for one player: result, goals, official MVP; null if they were not in the teams. */
export function outcomeFor(match: Pick<Match, 'score_white' | 'score_black' | 'team_white' | 'team_black' | 'scorers' | 'mvp_player_id'>, playerId: string) {
  const inWhite = (match.team_white || []).some((p) => p.id === playerId);
  const inBlack = (match.team_black || []).some((p) => p.id === playerId);
  if (!inWhite && !inBlack) return null;
  const w = match.score_white ?? 0;
  const b = match.score_black ?? 0;
  const result: MatchOutcome = w === b ? 'drawn' : inWhite === w > b ? 'won' : 'lost';
  const goals = (match.scorers || []).filter((s) => s.player_id === playerId).reduce((t, s) => t + (s.goals || 0), 0);
  return { result, goals, mvp: match.mvp_player_id === playerId };
}

/** The MVP vote for an external player follows the app's window: from kick-off + 1h45 for 24 hours. */
export function externalVoteWindow(kickOffIso: string): { opensAt: number; closesAt: number } {
  const opensAt = Date.parse(kickOffIso) + 105 * 60_000;
  return { opensAt, closesAt: opensAt + 24 * 3_600_000 };
}
