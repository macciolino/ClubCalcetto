import { adminAuth, adminDb } from '@/lib/firebase/admin';

/**
 * Moving a player's history from one profile id to another.
 * Profile ids are account ids (uid), so a guest (`guest-…`) that becomes a registered account, or an old record
 * that is archived, needs every reference to be rewritten: archived matches (teams, scorers, MVP, penalty saves,
 * W/D/L effects), generated teams, payments, MVP votes and sign-ups. Statistics are computed from the matches,
 * so after the move they belong to the new id, unchanged.
 */

const REF_COLLECTIONS = ['matches', 'generated_teams', 'match_payments', 'mvp_votes'];

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/** Replaces every string value AND object key equal to `from` with `to` (Timestamps and other objects untouched). */
function deepReplace(value: unknown, from: string, to: string): { value: unknown; changed: boolean } {
  if (value === from) return { value: to, changed: true };
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const r = deepReplace(v, from, to);
      changed = changed || r.changed;
      return r.value;
    });
    return { value: out, changed };
  }
  if (isPlain(value)) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = deepReplace(v, from, to);
      const key = k === from ? to : k;
      changed = changed || r.changed || key !== k;
      out[key] = r.value;
    }
    return { value: out, changed };
  }
  return { value, changed: false };
}

async function commitOps(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>) {
  const db = adminDb();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

/** Rewrites every reference to `fromId` into `toId` (matches, teams, payments, votes, sign-ups). */
export async function moveReferences(fromId: string, toId: string): Promise<number> {
  const db = adminDb();
  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];

  for (const name of REF_COLLECTIONS) {
    const snap = await db.collection(name).get();
    for (const d of snap.docs) {
      const r = deepReplace(d.data(), fromId, toId);
      // I voti MVP hanno l'id di chi vota nel nome del documento
      const newId = name === 'mvp_votes' && d.id.endsWith(`_${fromId}`) ? d.id.slice(0, -fromId.length) + toId : d.id;
      if (newId !== d.id) {
        const target = db.doc(`${name}/${newId}`);
        ops.push((b) => b.set(target, r.value as FirebaseFirestore.DocumentData));
        ops.push((b) => b.delete(d.ref));
      } else if (r.changed) {
        ops.push((b) => b.set(d.ref, r.value as FirebaseFirestore.DocumentData));
      }
    }
  }

  // Presenze: id del documento = `${date}_${playerId}`
  const presences = await db.collection('presences').where('player_id', '==', fromId).get();
  for (const d of presences.docs) {
    const data = d.data();
    const target = db.doc(`presences/${String(data.date)}_${toId}`);
    const exists = (await target.get()).exists;
    if (!exists) {
      const r = deepReplace(data, fromId, toId);
      ops.push((b) => b.set(target, { ...(r.value as FirebaseFirestore.DocumentData), id: target.id, player_id: toId }));
    }
    ops.push((b) => b.delete(d.ref));
  }

  await commitOps(ops);
  return ops.length;
}

const counters = ['matches_won', 'matches_drawn', 'matches_lost'] as const;

/**
 * A guest becomes a registered account: the guest's matches, goals, MVP, sign-ups, parameters (stats, OVR, role)
 * and W/D/L counters go to the account `toId`; the empty guest record is then removed.
 * The account keeps its own name, email and photo.
 */
export async function claimGuest(guestId: string, toId: string): Promise<{ guestName: string }> {
  const db = adminDb();
  const guestRef = db.doc(`profiles/${guestId}`);
  const targetRef = db.doc(`profiles/${toId}`);
  const [guest, target] = await Promise.all([guestRef.get(), targetRef.get()]);
  if (!guest.exists || !guest.data()?.is_guest) throw new Error('not_a_guest');
  if (!target.exists) throw new Error('no_account');
  const g = guest.data() || {};
  const t = target.data() || {};

  await moveReferences(guestId, toId);

  const patch: Record<string, unknown> = { is_guest: false, updated_at: new Date().toISOString(), linked_guest_id: guestId };
  if (g.stats) patch.stats = g.stats;
  if (typeof g.overall_rating === 'number') patch.overall_rating = g.overall_rating;
  if (g.position) patch.position = g.position;
  counters.forEach((c) => (patch[c] = Number(t[c] || 0) + Number(g[c] || 0)));
  await targetRef.update(patch);
  await guestRef.delete();
  return { guestName: String(g.full_name || 'Ospite') };
}

/**
 * "Start from zero": the old record of a closed account is archived under a new id (`ex-…`, anonymised: no email,
 * no account, hidden) with all its matches, so the history stays readable under the frozen name; the account is
 * re-enabled with a clean profile (0 matches, parameters at the club's default values).
 */
export async function archiveAndReset(profileId: string): Promise<{ name: string }> {
  const db = adminDb();
  const ref = db.doc(`profiles/${profileId}`);
  const old = (await ref.get()).data();
  if (!old) throw new Error('not_found');
  const name = String(old.full_name || 'Ex giocatore');
  const archivedId = `ex-${Date.now()}`;
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { restore_requested_at, sessions_revoked_at, ...rest } = old;
  await db.doc(`profiles/${archivedId}`).set({
    ...rest,
    id: archivedId,
    user_id: null,
    email: null,
    avatar_url: null,
    is_guest: true,
    archived_at: now,
    deactivated_at: old.deactivated_at || now,
    deactivated_by: old.deactivated_by || 'self',
  });
  await moveReferences(profileId, archivedId);

  const cats = await db.collection('stat_categories').get();
  const stats: Record<string, number> = {};
  cats.docs.forEach((c) => (stats[String(c.data().name)] = Number(c.data().default_value ?? 6)));
  const values = Object.values(stats);
  await ref.set({
    id: profileId,
    user_id: old.user_id || profileId,
    email: old.email || null,
    full_name: name,
    ...(old.first_name ? { first_name: old.first_name, last_name: old.last_name } : {}),
    avatar_url: old.avatar_url || null,
    role: 'player',
    position: old.position || 'Esterno',
    is_guest: false,
    stats,
    overall_rating: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)) : 6,
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    created_at: now,
    updated_at: now,
  });
  await adminAuth().updateUser(String(old.user_id || profileId), { disabled: false }).catch(() => undefined);
  return { name };
}
