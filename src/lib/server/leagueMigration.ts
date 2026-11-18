import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { SUPER_ADMIN_PROFILE_ID } from '@/lib/superAdmin';
import { leagueRoleFromLegacy, leagueSlug } from '@/lib/utils/leaguePermissions';
import { CALCETTARI_LEAGUE_ID, CALCETTARI_LEAGUE_NAME, type League, type LeagueMembershipEntry } from '@/types/league';

/**
 * Multi-league step 1A: creates the league "I Calcettari" from the single-group data.
 *
 * SAFE BY DESIGN:
 *  - it only COPIES: the old top-level collections are never changed or deleted (they stay as a backup);
 *  - it never overwrites: a document already present in the league is left as it is, so running it again
 *    (even after the app started writing in the league) only adds what is still missing;
 *  - dryRun (the default of the route) only counts.
 */

/** Club collections copied as they are into `leagues/calcettari/<name>/<same id>`. */
export const LEAGUE_COLLECTIONS = [
  'matches',
  'presences',
  'generated_teams',
  'match_payments',
  'mvp_votes',
  'sport_fields',
  'stat_categories',
  'settings',
  'admin_requests',
  'notify_state',
] as const;

/** Account-level profile fields that stay only in the global profile (never copied into the league card). */
const ACCOUNT_ONLY_FIELDS = ['email', 'locale', 'theme', 'sessions_revoked_at', 'platformRole'];

export interface LeagueMigrationCount {
  source: number;
  toCreate: number;
}

export interface LeagueMigrationResult {
  leagueId: string;
  leagueCreated: boolean;
  collections: Record<string, LeagueMigrationCount>;
  players: LeagueMigrationCount;
  presidents: number;
  memberships: LeagueMigrationCount;
  superAdminSet: boolean;
  writes: number;
}

type Write = { ref: DocumentReference; data: Record<string, unknown>; merge?: boolean };

/** Which of these refs do not exist yet (read in chunks). */
async function missing(refs: DocumentReference[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await adminDb().getAll(...refs.slice(i, i + 300));
    snaps.forEach((s) => !s.exists && out.add(s.ref.path));
  }
  return out;
}

async function commit(writes: Write[]) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = adminDb().batch();
    for (const w of writes.slice(i, i + 400)) {
      if (w.merge) batch.set(w.ref, w.data, { merge: true });
      else batch.create(w.ref, w.data); // create: fails instead of overwriting if someone wrote it meanwhile
    }
    await batch.commit();
  }
}

/** League card of a legacy profile (same id). */
export function playerFromProfile(id: string, profile: Record<string, unknown>): Record<string, unknown> {
  const data = { ...profile };
  for (const k of ACCOUNT_ONLY_FIELDS) delete data[k];
  const isGuest = data.is_guest === true;
  return {
    ...data,
    id,
    userId: isGuest ? null : (typeof data.user_id === 'string' && data.user_id) || null,
    leagueRole: leagueRoleFromLegacy({ id, role: data.role as string }, SUPER_ADMIN_PROFILE_ID),
    isActivePlayer: true,
  };
}

export async function migrateToCalcettari(dryRun: boolean): Promise<LeagueMigrationResult> {
  const db = adminDb();
  const leagueId = CALCETTARI_LEAGUE_ID;
  const leagueRef = db.doc(`leagues/${leagueId}`);
  const writes: Write[] = [];
  const result: LeagueMigrationResult = {
    leagueId,
    leagueCreated: false,
    collections: {},
    players: { source: 0, toCreate: 0 },
    presidents: 0,
    memberships: { source: 0, toCreate: 0 },
    superAdminSet: false,
    writes: 0,
  };

  // 1. league document
  if (!(await leagueRef.get()).exists) {
    const now = new Date().toISOString();
    const league: League = {
      id: leagueId,
      name: CALCETTARI_LEAGUE_NAME,
      slug: leagueSlug(CALCETTARI_LEAGUE_NAME),
      status: 'active',
      visibility: 'private',
      defaultFormat: '5v5',
      createdAt: now,
      createdBy: SUPER_ADMIN_PROFILE_ID,
      migratedAt: now,
    };
    writes.push({ ref: leagueRef, data: league as unknown as Record<string, unknown> });
    result.leagueCreated = true;
  }

  // 2. club collections, same ids
  for (const name of LEAGUE_COLLECTIONS) {
    const src = await db.collection(name).get();
    const targets = src.docs.map((d) => leagueRef.collection(name).doc(d.id));
    const todo = await missing(targets);
    src.docs.forEach((d, i) => todo.has(targets[i].path) && writes.push({ ref: targets[i], data: d.data() }));
    result.collections[name] = { source: src.size, toCreate: todo.size };
  }

  // 3. players: one league card per profile (guests and closed accounts included, so the history keeps its names)
  const profiles = await db.collection('profiles').get();
  const playerRefs = profiles.docs.map((p) => leagueRef.collection('players').doc(p.id));
  const todoPlayers = await missing(playerRefs);
  const memberships = new Map<string, LeagueMembershipEntry>();
  profiles.docs.forEach((p, i) => {
    const card = playerFromProfile(p.id, p.data());
    if (card.leagueRole === 'PRESIDENT') result.presidents++;
    if (todoPlayers.has(playerRefs[i].path)) writes.push({ ref: playerRefs[i], data: card });
    // archived records (`ex-…`) share nothing with the account any more: no membership for them
    const uid = card.userId as string | null;
    if (uid && !card.archived_at && !memberships.has(uid)) {
      memberships.set(uid, { player_id: p.id, league_role: card.leagueRole as LeagueMembershipEntry['league_role'], name: CALCETTARI_LEAGUE_NAME });
    }
  });
  result.players = { source: profiles.size, toCreate: todoPlayers.size };

  // 4. memberships/{uid}.leagues.calcettari (only if missing: a later role change is never undone)
  const uids = Array.from(memberships.keys());
  const mSnaps = uids.length ? await db.getAll(...uids.map((u) => db.doc(`memberships/${u}`))) : [];
  mSnaps.forEach((s, i) => {
    if (s.data()?.leagues?.[leagueId]) return;
    writes.push({
      ref: s.ref,
      data: { leagues: { [leagueId]: memberships.get(uids[i]) }, updated_at: new Date().toISOString() },
      merge: true,
    });
    result.memberships.toCreate++;
  });
  result.memberships.source = uids.length;

  // 5. platform role of the super admin
  const superSnap = profiles.docs.find((p) => p.id === SUPER_ADMIN_PROFILE_ID);
  if (superSnap && superSnap.data().platformRole !== 'SUPER_ADMIN') {
    writes.push({ ref: superSnap.ref, data: { platformRole: 'SUPER_ADMIN' }, merge: true });
    result.superAdminSet = true;
  }

  result.writes = writes.length;
  if (!dryRun) await commit(writes);
  return result;
}
