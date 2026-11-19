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

/**
 * Can `by` (a member of the league) take `target` OUT OF THIS LEAGUE? The global account is never touched:
 * deleting / deactivating an account is only for its owner or the platform super admin.
 * Managers remove players; only presidents remove collaborators; presidents are demoted first (never removed),
 * nobody removes themselves (they leave) or the super admin's card; guests are deleted, not removed.
 */
export function canRemoveFromLeague(
  by: { id: string; leagueRole?: LeagueRole | null },
  target: { id: string; leagueRole?: LeagueRole | null; is_guest?: boolean; userId?: string | null; removed_at?: string | null },
  superAdminProfileId: string
): boolean {
  if (!canManageMatchesAndCash(by.leagueRole)) return false;
  if (target.is_guest || !target.userId || target.removed_at) return false;
  if (target.id === by.id || target.id === superAdminProfileId) return false;
  const role = target.leagueRole || 'PLAYER';
  if (role === 'PLAYER') return true;
  return role === 'COLLABORATOR' && by.leagueRole === 'PRESIDENT';
}
