import { auth } from '@/lib/firebase/config';
import type { MatchFormat } from '@/types/database';
import type { LeagueRole, LeagueVisibility } from '@/types/league';
import { currentLeagueId } from '@/lib/league/leagueRefs';

export interface CreateLeagueInput {
  name: string;
  visibility: LeagueVisibility;
  defaultFormat?: MatchFormat;
  defaultLocation?: string;
  joinAsPlayer: boolean;
}

export type CreateLeagueError = 'bad_request' | 'too_many' | 'email_not_verified' | 'failed';

/** Multi-league step 2: creates a league on the server (the creator becomes president). */
export async function createLeagueRequest(input: CreateLeagueInput): Promise<{ id: string } | { error: CreateLeagueError }> {
  const user = auth.currentUser;
  if (!user) return { error: 'failed' };
  try {
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    if (data.ok && data.id) return { id: data.id };
    const known: CreateLeagueError[] = ['bad_request', 'too_many', 'email_not_verified'];
    return { error: known.includes(data.error as CreateLeagueError) ? (data.error as CreateLeagueError) : 'failed' };
  } catch {
    return { error: 'failed' };
  }
}

/** An invite code from what the user typed or pasted: a bare code or a link ending in /join/<code>. */
export function inviteCodeFrom(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/join\/([A-Za-z0-9_-]{6,64})(?:[/?#].*)?$/) || t.match(/^([A-Za-z0-9_-]{6,64})$/);
  return m ? m[1] : null;
}

async function leagueFetch(url: string, init: RequestInit = {}, withAuth = true): Promise<{ status: number; data: Record<string, unknown> }> {
  const user = auth.currentUser;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-league-id': currentLeagueId() };
  if (withAuth && user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  try {
    const res = await fetch(url, { ...init, headers: { ...headers, ...((init.headers as Record<string, string>) || {}) } });
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { status: 0, data: { ok: false, error: 'failed' } };
  }
}

/** Invite link of the active league (presidents and collaborators); `regenerate` revokes the old one. */
export async function fetchInviteCode(regenerate = false): Promise<string | null> {
  const { data } = await leagueFetch('/api/league-invite', { method: 'POST', body: JSON.stringify({ regenerate }) });
  return data.ok && typeof data.code === 'string' ? data.code : null;
}

export const inviteUrl = (code: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${code}`;

export interface GhostPlayer {
  id: string;
  name: string;
  position: string | null;
}

export interface JoinInfo {
  leagueName: string;
  leagueId?: string;
  member?: boolean;
  ghosts?: GhostPlayer[];
}

/** What an invite link points to (null = not valid). Signed in: also whether already a member and the ghost players. */
export async function fetchJoinInfo(code: string): Promise<JoinInfo | null> {
  const { data } = await leagueFetch(`/api/join?code=${encodeURIComponent(code)}`, {}, true);
  return data.ok ? (data as unknown as JoinInfo) : null;
}

export type JoinError = 'invalid' | 'not_a_ghost' | 'email_not_verified' | 'failed';

export async function joinLeagueRequest(code: string, claimPlayerId: string | null): Promise<{ leagueId: string; claimPending?: string } | { error: JoinError }> {
  const { data } = await leagueFetch('/api/join', { method: 'POST', body: JSON.stringify({ code, claimPlayerId }) });
  if (data.ok && typeof data.leagueId === 'string') return { leagueId: data.leagueId, claimPending: data.claimPending as string | undefined };
  const known: JoinError[] = ['invalid', 'not_a_ghost', 'email_not_verified'];
  return { error: known.includes(data.error as JoinError) ? (data.error as JoinError) : 'failed' };
}

export type LeagueAdminError =
  | 'bad_request'
  | 'not_found'
  | 'guest'
  | 'last_president'
  | 'protected'
  | 'forbidden'
  | 'suspended'
  | 'name_mismatch'
  | 'failed';

/**
 * Active league: name / visibility (presidents), member roles (presidents), own "I play too",
 * taking a member out of the league (managers; the account is never touched).
 */
export async function leagueAdminRequest(
  body:
    | { action: 'settings'; name?: string; visibility?: LeagueVisibility }
    | { action: 'role'; playerId: string; role: LeagueRole }
    | { action: 'playing'; active: boolean }
    | { action: 'remove'; playerId: string }
    | { action: 'delete'; confirmName: string }
): Promise<'ok' | LeagueAdminError> {
  const { data } = await leagueFetch('/api/league-admin', { method: 'POST', body: JSON.stringify(body) });
  if (data.ok) return 'ok';
  const known: LeagueAdminError[] = ['bad_request', 'not_found', 'guest', 'last_president', 'protected', 'forbidden', 'suspended', 'name_mismatch'];
  return known.includes(data.error as LeagueAdminError) ? (data.error as LeagueAdminError) : 'failed';
}

// ---------- step 4: platform super admin ----------

export interface PlatformLeague {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  visibility: string;
  createdAt: string;
  createdBy: string;
  members: number;
  guests: number;
}

/** Every league of the platform (super admin and platform admins); null = failed, 'forbidden' = no platform role. */
export async function fetchPlatformLeagues(): Promise<PlatformLeague[] | null | 'forbidden'> {
  const { status, data } = await leagueFetch('/api/super-admin/leagues');
  if (status === 403) return 'forbidden';
  return data.ok && Array.isArray(data.leagues) ? (data.leagues as PlatformLeague[]) : null;
}

/** Super admin: deletes a league for good (the typed name must match). */
export async function deletePlatformLeague(leagueId: string, confirmName: string): Promise<'ok' | 'name_mismatch' | 'protected' | 'not_found' | 'failed'> {
  const { data } = await leagueFetch('/api/super-admin/leagues', { method: 'POST', body: JSON.stringify({ leagueId, action: 'delete', confirmName }) });
  if (data.ok) return 'ok';
  return ['name_mismatch', 'protected', 'not_found'].includes(String(data.error)) ? (data.error as 'name_mismatch' | 'protected' | 'not_found') : 'failed';
}

export async function setPlatformLeagueStatus(leagueId: string, status: 'active' | 'suspended'): Promise<boolean> {
  const { data } = await leagueFetch('/api/super-admin/leagues', { method: 'POST', body: JSON.stringify({ leagueId, status }) });
  return data.ok === true;
}

// ---------- platform admins (GLOBAL_ADMIN), super admin only ----------

export interface PlatformStaff {
  profileId: string;
  name: string;
  platformRole: 'SUPER_ADMIN' | 'GLOBAL_ADMIN';
}

export async function fetchPlatformStaff(): Promise<PlatformStaff[] | null> {
  const { data } = await leagueFetch('/api/super-admin/admins');
  return data.ok && Array.isArray(data.staff) ? (data.staff as PlatformStaff[]) : null;
}

export type PlatformRoleResult = { ok: true; name: string } | { ok: false; error: 'bad_request' | 'not_found' | 'protected' | 'failed' };

/** Appoints a platform admin by the EXACT email of their account ({ email }), or revokes one ({ profileId } or { email }). */
export async function setPlatformAdmin(target: { email?: string; profileId?: string }, role: 'GLOBAL_ADMIN' | 'USER'): Promise<PlatformRoleResult> {
  const { data } = await leagueFetch('/api/super-admin/admins', { method: 'POST', body: JSON.stringify({ ...target, role }) });
  if (data.ok) return { ok: true, name: String(data.name || target.email || '') };
  const error = ['bad_request', 'not_found', 'protected'].includes(String(data.error)) ? (data.error as 'bad_request' | 'not_found' | 'protected') : 'failed';
  return { ok: false, error };
}

/** C2 — emails of the members of the ACTIVE league only ({ profileId: email }); null = not allowed or failed. */
export async function fetchLeagueEmails(): Promise<Record<string, string> | null> {
  const { data } = await leagueFetch('/api/league-emails');
  return data.ok ? ((data.emails as Record<string, string>) || {}) : null;
}
