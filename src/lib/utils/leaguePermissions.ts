import type { LeagueRole, PlatformRole } from '@/types/league';

/** Pure permission helpers for the active league (the real enforcement lives in firestore.rules). */

export const isPresident = (role?: LeagueRole | null) => role === 'PRESIDENT';

/** League name, visibility, roles of the members: presidents only. */
export const canManageLeague = (role?: LeagueRole | null) => role === 'PRESIDENT';

/** Matches, teams, results, presences of others and cash: presidents and collaborators. */
export const canManageMatchesAndCash = (role?: LeagueRole | null) => role === 'PRESIDENT' || role === 'COLLABORATOR';

export const isPlatformSuperAdmin = (role?: PlatformRole | null) => role === 'SUPER_ADMIN';

/**
 * Can `playerId` get `next` as role? Refused only when it would leave the league without a president.
 * `members` = current roles of every member.
 */
export function canChangeLeagueRole(members: { id: string; leagueRole: LeagueRole }[], playerId: string, next: LeagueRole): boolean {
  const current = members.find((m) => m.id === playerId);
  if (!current) return false;
  if (current.leagueRole !== 'PRESIDENT' || next === 'PRESIDENT') return true;
  return members.filter((m) => m.leagueRole === 'PRESIDENT').length > 1;
}

/** Role in the migrated league from the single-group data: today's admins (and the super admin) become presidents. */
export function leagueRoleFromLegacy(profile: { id: string; role?: string | null }, superAdminProfileId: string): LeagueRole {
  return profile.role === 'admin' || profile.id === superAdminProfileId ? 'PRESIDENT' : 'PLAYER';
}

/** URL-friendly league slug: "I Calcettari" → "i-calcettari". */
export function leagueSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
