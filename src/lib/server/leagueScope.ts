import { AsyncLocalStorage } from 'node:async_hooks';
import { adminDb } from '@/lib/firebase/admin';
import { CALCETTARI_LEAGUE_ID } from '@/types/league';

/**
 * Multi-league (1B), server side: the league a request works on. API routes run their work inside
 * `inLeague(leagueId, fn)`; server helpers then read `leagueDb()` instead of top-level collections.
 * Outside a scope the default is "I Calcettari" (the only league until step 2).
 */
const scope = new AsyncLocalStorage<string>();

export function inLeague<T>(leagueId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return scope.run(cleanLeagueId(leagueId), fn);
}

export function cleanLeagueId(leagueId: unknown): string {
  return typeof leagueId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(leagueId) ? leagueId : CALCETTARI_LEAGUE_ID;
}

export function currentLeague(): string {
  return scope.getStore() || CALCETTARI_LEAGUE_ID;
}

/** `leagues/{current}/…` with the same `.doc(path)` / `.collection(path)` API as adminDb(). */
export function leagueDb(leagueId = currentLeague()) {
  const base = `leagues/${leagueId}`;
  return {
    id: leagueId,
    ref: adminDb().doc(base),
    doc: (path: string) => adminDb().doc(`${base}/${path}`),
    collection: (path: string) => adminDb().collection(`${base}/${path}`),
  };
}

export type LeagueRoleOnServer = 'PRESIDENT' | 'COLLABORATOR' | 'PLAYER';

/** The caller's card in the current league (via `memberships/{uid}`), or null when not a member. */
export async function memberCard(uid: string, leagueId = currentLeague()) {
  const m = await adminDb().doc(`memberships/${uid}`).get();
  const playerId = m.data()?.leagues?.[leagueId]?.player_id as string | undefined;
  if (!playerId) return null;
  const card = await leagueDb(leagueId).doc(`players/${playerId}`).get();
  return card.exists ? { playerId, data: card.data() || {} } : null;
}

/** The league exists and is not suspended by the platform super admin (step 4). */
export async function isLeagueActive(leagueId = currentLeague()): Promise<boolean> {
  const league = await adminDb().doc(`leagues/${leagueId}`).get();
  return league.exists && league.data()?.status !== 'suspended';
}

/** President or collaborator of the current league (not deactivated), in a league that is not suspended. */
export async function isLeagueManager(uid: string, leagueId = currentLeague()): Promise<boolean> {
  if (!(await isLeagueActive(leagueId))) return false;
  const card = await memberCard(uid, leagueId);
  const role = card?.data.leagueRole as LeagueRoleOnServer | undefined;
  return Boolean(card && !card.data.deactivated_at && (role === 'PRESIDENT' || role === 'COLLABORATOR'));
}

/** Every league id that has a card with this player id (used by account-level actions: close, reactivate…). */
export async function leaguesWithPlayer(playerId: string): Promise<string[]> {
  const leagues = await adminDb().collection('leagues').select().get();
  const cards = leagues.size ? await adminDb().getAll(...leagues.docs.map((l) => l.ref.collection('players').doc(playerId))) : [];
  return cards.filter((c) => c.exists).map((c) => c.ref.parent.parent!.id);
}

/** Copies account-level state (deactivation, return request…) on the player's cards in every league. */
export async function mirrorOnCards(playerId: string, patch: Record<string, unknown>): Promise<void> {
  const ids = await leaguesWithPlayer(playerId);
  await Promise.all(ids.map((id) => leagueDb(id).doc(`players/${playerId}`).update(patch)));
}

/** API route handler run in the league named by the `x-league-id` header (sent by the app; default "I Calcettari"). */
export function scoped(handler: (request: Request) => Promise<Response>) {
  return (request: Request) => inLeague(request.headers.get('x-league-id'), () => handler(request));
}
