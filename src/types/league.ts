import type { MatchFormat, Profile } from './database';

/**
 * Multi-league model (step 1A). Every league keeps its own data under `leagues/{leagueId}/…`
 * (players, matches, presences, teams, cash, settings…). Account-level data stays global in `profiles/{id}`.
 */

/** Platform level, on `profiles/{id}.platformRole` (missing = 'USER'). Super admins govern the app, they are NOT members of every league. */
export type PlatformRole = 'SUPER_ADMIN' | 'USER';

/** Role inside one league. Several PRESIDENTs are allowed; a league always keeps at least one. */
export type LeagueRole = 'PRESIDENT' | 'COLLABORATOR' | 'PLAYER';

export type LeagueStatus = 'active' | 'suspended';
export type LeagueVisibility = 'private' | 'public';

/** `leagues/{leagueId}` */
export interface League {
  id: string;
  name: string;
  slug: string;
  status: LeagueStatus;
  visibility: LeagueVisibility;
  defaultFormat?: MatchFormat;
  defaultLocation?: string;
  createdAt: string;
  /** Profile id of the creator */
  createdBy: string;
  /** Set by the migration that created the league from the single-group data */
  migratedAt?: string;
}

/**
 * `leagues/{leagueId}/players/{playerId}`: the player's card INSIDE one league (OVR, parameters, W/D/L, guests…).
 * The id is the same profile id used everywhere else (uid, `p-1`, `guest-…`), so match teams, scorers,
 * MVP, cash and presence ids keep pointing to it.
 */
export interface LeagueMemberPlayer extends Omit<Profile, 'email' | 'locale' | 'theme' | 'sessions_revoked_at'> {
  /** Auth uid of the account; null for a guest / ghost player not claimed yet */
  userId: string | null;
  leagueRole: LeagueRole;
  /** Presidents and collaborators can play (true) or only organise (false) */
  isActivePlayer: boolean;
}

/** One entry of `memberships/{uid}.leagues` (server-written index the rules use to know who belongs where). */
export interface LeagueMembershipEntry {
  player_id: string;
  league_role: LeagueRole;
  name: string;
}

/** `memberships/{uid}`: written only by the server. */
export interface LeagueMembership {
  leagues: Record<string, LeagueMembershipEntry>;
  updated_at?: string;
}

/** `leagues/{leagueId}/invites/{code}` (step 3): link `/join/{code}`. */
export interface LeagueInvite {
  code: string;
  leagueId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  /** Optional: invite meant for one ghost player (claim) */
  playerId?: string | null;
  revoked?: boolean;
}

/** The league created from the existing single-group data. */
export const CALCETTARI_LEAGUE_ID = 'calcettari';
export const CALCETTARI_LEAGUE_NAME = 'I Calcettari';
