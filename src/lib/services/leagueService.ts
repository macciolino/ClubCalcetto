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

export async function joinLeagueRequest(code: string, claimPlayerId: string | null): Promise<{ leagueId: string; claimed?: string } | { error: JoinError }> {
  const { data } = await leagueFetch('/api/join', { method: 'POST', body: JSON.stringify({ code, claimPlayerId }) });
  if (data.ok && typeof data.leagueId === 'string') return { leagueId: data.leagueId, claimed: data.claimed as string | undefined };
  const known: JoinError[] = ['invalid', 'not_a_ghost', 'email_not_verified'];
  return { error: known.includes(data.error as JoinError) ? (data.error as JoinError) : 'failed' };
}

export type LeagueAdminError = 'bad_request' | 'not_found' | 'guest' | 'last_president' | 'protected' | 'forbidden' | 'suspended' | 'failed';

/** Active league: name / visibility (presidents), member roles (presidents), own "I play too". */
export async function leagueAdminRequest(
  body: { action: 'settings'; name?: string; visibility?: LeagueVisibility } | { action: 'role'; playerId: string; role: LeagueRole } | { action: 'playing'; active: boolean }
): Promise<'ok' | LeagueAdminError> {
  const { data } = await leagueFetch('/api/league-admin', { method: 'POST', body: JSON.stringify(body) });
  if (data.ok) return 'ok';
  const known: LeagueAdminError[] = ['bad_request', 'not_found', 'guest', 'last_president', 'protected', 'forbidden', 'suspended'];
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

/** Every league of the platform (platform super admins only); null = failed, 'forbidden' = not a super admin. */
export async function fetchPlatformLeagues(): Promise<PlatformLeague[] | null | 'forbidden'> {
  const { status, data } = await leagueFetch('/api/super-admin/leagues');
  if (status === 403) return 'forbidden';
  return data.ok && Array.isArray(data.leagues) ? (data.leagues as PlatformLeague[]) : null;
}

export async function setPlatformLeagueStatus(leagueId: string, status: 'active' | 'suspended'): Promise<boolean> {
  const { data } = await leagueFetch('/api/super-admin/leagues', { method: 'POST', body: JSON.stringify({ leagueId, status }) });
  return data.ok === true;
}
