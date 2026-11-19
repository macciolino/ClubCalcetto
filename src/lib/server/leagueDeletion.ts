import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { CALCETTARI_LEAGUE_ID } from '@/types/league';

export type DeleteLeagueResult = 'ok' | 'not_found' | 'name_mismatch' | 'protected';

/** The typed confirmation must be the league name exactly (spaces at the ends and repeated spaces ignored). */
export const sameLeagueName = (typed: unknown, name: string) =>
  String(typed ?? '').trim().replace(/\s+/g, ' ') === name.trim().replace(/\s+/g, ' ');

/**
 * Deletes a league FOR GOOD (presidents of that league or the platform super admin, checked by the caller):
 * every subcollection (players, matches, presences, teams, cash, settings, requests…), its invite links and the
 * league entry in the `memberships` of every member, so nobody keeps a ghost league in the switcher.
 * The global accounts and the other leagues are untouched. The base league "I Calcettari" can never be deleted
 * (it is the one the server falls back to).
 */
export async function deleteLeague(leagueId: string, confirmName: unknown): Promise<DeleteLeagueResult> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leagueId)) return 'not_found';
  if (leagueId === CALCETTARI_LEAGUE_ID) return 'protected';
  const db = adminDb();
  const ref = db.doc(`leagues/${leagueId}`);
  const league = await ref.get();
  if (!league.exists) return 'not_found';
  if (!sameLeagueName(confirmName, String(league.data()?.name || ''))) return 'name_mismatch';

  // Who has this league in their memberships: the accounts of its cards + anyone indexed there (safety net)
  const [cards, indexed, invites] = await Promise.all([
    ref.collection('players').get(),
    db.collection('memberships').where(new FieldPath('leagues', leagueId, 'player_id'), '>=', '').get(),
    db.collection('league_invites').where('leagueId', '==', leagueId).get(),
  ]);
  const uids = new Set<string>(indexed.docs.map((d) => d.id));
  cards.docs.forEach((c) => {
    const uid = c.data().userId;
    if (typeof uid === 'string' && uid) uids.add(uid);
  });
  const now = new Date().toISOString();
  const writes: ((b: FirebaseFirestore.WriteBatch) => void)[] = [
    ...Array.from(uids).map((uid) => (b: FirebaseFirestore.WriteBatch) =>
      b.set(db.doc(`memberships/${uid}`), { leagues: { [leagueId]: FieldValue.delete() }, updated_at: now }, { merge: true })
    ),
    ...invites.docs.map((d) => (b: FirebaseFirestore.WriteBatch) => b.delete(d.ref)),
  ];
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach((w) => w(batch));
    await batch.commit();
  }
  await db.recursiveDelete(ref);
  return 'ok';
}
