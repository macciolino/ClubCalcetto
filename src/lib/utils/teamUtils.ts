import { GeneratedTeamRecord, MatchTeamPlayer, Profile, StoredTeamPlayer, TeamSubstitution } from '@/types/database';

/** Slot labels of the 1-1-2-1 diamond, in the order players are stored. */
export const SLOT_LABELS = ['POR', 'DIF', 'EST SX', 'EST DX', 'PUN'] as const;

export const storedName = (p: StoredTeamPlayer): string => p.name || p.full_name || 'Giocatore';

export const toTeamPlayer = (p: { id: string; full_name?: string; name?: string }): MatchTeamPlayer => ({
  id: p.id,
  name: p.name || p.full_name || 'Giocatore',
});

/** Same split, whatever the shirt colour: used to tell if "Ribilancia" really changed something. */
export function splitKey(whiteIds: string[], blackIds: string[]): string {
  const a = [...whiteIds].sort().join(',');
  const b = [...blackIds].sort().join(',');
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface ReconciledTeams {
  white: MatchTeamPlayer[];
  black: MatchTeamPlayer[];
  /** Players who left the starters, replaced by who took their place */
  substitutions: Omit<TeamSubstitution, 'at'>[];
  /** Places still empty (fewer than 10 starters) */
  emptySlots: number;
}

/**
 * Keeps the saved teams as they are. Only if a player is no longer among the starters
 * (withdrew), the newcomer among the starters takes exactly that slot (same team, same role).
 * Pure and deterministic: everyone sees the same teams without anything being written.
 */
export function reconcileTeams(
  record: Pick<GeneratedTeamRecord, 'team_white' | 'team_black'>,
  starters: { id: string; name: string }[]
): ReconciledTeams {
  const starterIds = new Set(starters.map((s) => s.id));
  const white = (record.team_white || []).map(toTeamPlayer);
  const black = (record.team_black || []).map(toTeamPlayer);
  const inTeams = new Set([...white, ...black].map((p) => p.id));
  const newcomers = starters.filter((s) => !inTeams.has(s.id));
  const substitutions: ReconciledTeams['substitutions'] = [];
  let emptySlots = 0;

  const fill = (team: MatchTeamPlayer[]): MatchTeamPlayer[] =>
    team
      .map((p) => {
        if (starterIds.has(p.id)) return p;
        const incoming = newcomers.shift();
        if (!incoming) {
          emptySlots += 1;
          return null;
        }
        substitutions.push({ out_id: p.id, out_name: p.name, in_id: incoming.id, in_name: incoming.name });
        return { id: incoming.id, name: incoming.name };
      })
      .filter((p): p is MatchTeamPlayer => p !== null);

  return { white: fill(white), black: fill(black), substitutions, emptySlots };
}

/** Current profile for a team player (fresh photo and stats), or a minimal profile for the name only. */
export function profileForTeamPlayer(p: MatchTeamPlayer, profiles: Profile[]): Profile {
  const found = profiles.find((pr) => pr.id === p.id || pr.user_id === p.id);
  if (found) return found;
  return {
    id: p.id,
    user_id: null,
    full_name: p.name,
    avatar_url: null,
    role: 'player',
    position: 'Esterno',
    overall_rating: 6,
    stats: {},
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    created_at: '',
    updated_at: '',
  } as unknown as Profile;
}
