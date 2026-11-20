import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { leagueDb } from '@/lib/server/leagueScope';
import { listPlatformStaff } from '@/lib/server/platformAdmin';
import { sendToProfiles } from '@/lib/server/push';
import { CATALOG_DESC_KEYS, dedupKey, leagueFieldFromCatalog, looksLikeSameField } from '@/lib/utils/fieldCatalog';
import type { CatalogField, SportField } from '@/types/database';

/**
 * Global fields catalog (`field_catalog`, written ONLY here). See docs/ARCHITECTURE.md §3.3.
 *  - league managers propose a pitch (pending, usable at once in their league) or add an approved one;
 *  - platform staff approve (optionally correcting), reject (the league keeps a private copy), merge duplicates,
 *    edit or delete; corrections spread to every linked league field (prices only where the league did not set its own).
 */
const CATALOG = 'field_catalog';
const BIG = ['7v7', '8v8', '11v11'] as const;
const linkKey = (leagueId: string, fieldId: string) => `${leagueId}:${fieldId}`;

export type CatalogError = 'bad_request' | 'not_found' | 'not_approved' | 'already_linked' | 'not_pending';

export interface FieldInput {
  name: string;
  address: string;
  maps_url?: string;
  phone?: string;
  court_type?: string;
  notes?: string;
  cost?: number;
  costs?: SportField['costs'];
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const price = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 10000 ? Math.round(n * 100) / 100 : undefined;
};

/** Validates what the app sends; null = not acceptable. */
export function cleanFieldInput(raw: unknown): FieldInput | null {
  const b = (raw || {}) as Record<string, unknown>;
  const name = str(b.name, 80);
  const address = str(b.address, 160);
  if (!name || !address) return null;
  const maps = str(b.maps_url, 500);
  if (maps && !/^https:\/\/[^\s]+$/.test(maps)) return null;
  const out: FieldInput = { name, address };
  if (maps) out.maps_url = maps;
  const phone = str(b.phone, 30);
  if (phone) out.phone = phone;
  const court = str(b.court_type, 60);
  if (court) out.court_type = court;
  const notes = str(b.notes, 300);
  if (notes) out.notes = notes;
  const cost = price(b.cost);
  if (cost) out.cost = cost;
  const rawCosts = (b.costs || {}) as Record<string, unknown>;
  const costs: NonNullable<SportField['costs']> = {};
  BIG.forEach((f) => {
    const v = price(rawCosts[f]);
    if (v) costs[f] = v;
  });
  if (Object.keys(costs).length) out.costs = costs;
  return out;
}

const catalogOf = (d: FirebaseFirestore.DocumentSnapshot) => ({ ...(d.data() as CatalogField), id: d.id });

/** Public view of a catalog entry (never the list of linked leagues). */
function publicView(c: CatalogField) {
  const { linked, ...rest } = c;
  return { ...rest, leagues: Object.keys(linked || {}).length };
}
export type CatalogView = ReturnType<typeof publicView>;

/** Approved entries (everyone with an account) + the ones this league proposed that are still pending or rejected. */
export async function listCatalog(leagueId: string): Promise<{ approved: CatalogView[]; mine: CatalogView[] }> {
  const db = adminDb();
  const [approved, mine] = await Promise.all([
    db.collection(CATALOG).where('status', '==', 'approved').get(),
    db.collection(CATALOG).where('proposed_by.leagueId', '==', leagueId).get(),
  ]);
  return {
    approved: approved.docs.map((d) => publicView(catalogOf(d))).sort((a, b) => a.name.localeCompare(b.name)),
    mine: mine.docs.map((d) => publicView(catalogOf(d))).filter((c) => c.status !== 'approved'),
  };
}

/** Approved or pending entries that look like the same pitch (shown before proposing a new one). */
export async function similarFields(input: { name: string; address: string }): Promise<CatalogView[]> {
  const snap = await adminDb().collection(CATALOG).where('status', 'in', ['approved', 'pending']).get();
  return snap.docs.map(catalogOf).filter((c) => looksLikeSameField(c, input)).map(publicView);
}

async function notifyStaff(title: string, body: string) {
  const staff = await listPlatformStaff().catch(() => []);
  await sendToProfiles(staff.map((s) => s.profileId), { title, body, url: '/super-admin' }).catch(() => 0);
}

function newCatalogDoc(input: FieldInput, by: { profileId: string; leagueId: string; leagueName: string }, fieldId: string) {
  const now = new Date().toISOString();
  const doc: Omit<CatalogField, 'id'> = {
    name: input.name,
    address: input.address,
    status: 'pending',
    dedup_key: dedupKey(input.name, input.address),
    proposed_by: { profileId: by.profileId, leagueId: by.leagueId, leagueName: by.leagueName, at: now },
    linked: { [linkKey(by.leagueId, fieldId)]: true },
    created_at: now,
  };
  (['maps_url', 'phone', 'court_type', 'notes'] as const).forEach((k) => input[k] && (doc[k] = input[k]));
  if (input.cost) doc.default_cost = input.cost;
  if (input.costs) doc.default_costs = input.costs;
  return doc;
}

async function leagueName(leagueId: string) {
  return String((await adminDb().doc(`leagues/${leagueId}`).get()).data()?.name || leagueId);
}

/** A manager proposes a NEW pitch: pending in the catalog, and at once a usable field of their league. */
export async function proposeField(leagueId: string, by: { profileId: string; name: string }, raw: unknown) {
  const input = cleanFieldInput(raw);
  if (!input) return { ok: false as const, error: 'bad_request' as CatalogError };
  const db = adminDb();
  const fieldId = `field-${Date.now()}`;
  const ref = db.collection(CATALOG).doc();
  const lname = await leagueName(leagueId);
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(ref, newCatalogDoc(input, { profileId: by.profileId, leagueId, leagueName: lname }, fieldId));
  batch.set(leagueDb(leagueId).doc(`sport_fields/${fieldId}`), {
    id: fieldId,
    ...input,
    catalog_id: ref.id,
    catalog_status: 'pending',
    price_override: false,
    created_at: now,
  });
  await batch.commit();
  await notifyStaff('🏟️ Nuovo campo da approvare', `${by.name} (${lname}) propone "${input.name}", ${input.address}.`);
  return { ok: true as const, catalogId: ref.id, fieldId };
}

/** A private field the league already has goes to the catalog as a proposal (it stays usable, now linked). */
export async function proposeExistingField(leagueId: string, fieldId: string, by: { profileId: string; name: string }) {
  const db = adminDb();
  const fref = leagueDb(leagueId).doc(`sport_fields/${fieldId}`);
  const f = (await fref.get()).data() as SportField | undefined;
  if (!f) return { ok: false as const, error: 'not_found' as CatalogError };
  if (f.catalog_id) return { ok: false as const, error: 'already_linked' as CatalogError };
  const input = cleanFieldInput(f);
  if (!input) return { ok: false as const, error: 'bad_request' as CatalogError };
  const ref = db.collection(CATALOG).doc();
  const lname = await leagueName(leagueId);
  const batch = db.batch();
  batch.set(ref, newCatalogDoc(input, { profileId: by.profileId, leagueId, leagueName: lname }, fieldId));
  batch.update(fref, { catalog_id: ref.id, catalog_status: 'pending', price_override: true, updated_at: new Date().toISOString() });
  await batch.commit();
  await notifyStaff('🏟️ Nuovo campo da approvare', `${by.name} (${lname}) propone "${input.name}", ${input.address}.`);
  return { ok: true as const, catalogId: ref.id, fieldId };
}

/** Adds an APPROVED catalog pitch to the league (linked). Already there = the existing field. */
export async function addFromCatalog(leagueId: string, catalogId: string) {
  const db = adminDb();
  const snap = await db.doc(`${CATALOG}/${catalogId}`).get();
  if (!snap.exists) return { ok: false as const, error: 'not_found' as CatalogError };
  const c = catalogOf(snap);
  if (c.status !== 'approved') return { ok: false as const, error: 'not_approved' as CatalogError };
  const L = leagueDb(leagueId);
  const existing = await L.collection('sport_fields').where('catalog_id', '==', catalogId).limit(1).get();
  if (!existing.empty) return { ok: true as const, fieldId: existing.docs[0].id, existing: true };
  const fieldId = `field-${Date.now()}`;
  const batch = db.batch();
  batch.set(L.doc(`sport_fields/${fieldId}`), {
    id: fieldId,
    ...leagueFieldFromCatalog(c),
    catalog_id: catalogId,
    catalog_status: 'approved',
    price_override: false,
    created_at: new Date().toISOString(),
  });
  batch.update(snap.ref, { [`linked.${linkKey(leagueId, fieldId)}`]: true });
  await batch.commit();
  return { ok: true as const, fieldId, existing: false };
}

/** Prices of a linked field back to the catalog's starting prices. */
export async function resetPrice(leagueId: string, fieldId: string) {
  const fref = leagueDb(leagueId).doc(`sport_fields/${fieldId}`);
  const f = (await fref.get()).data() as SportField | undefined;
  if (!f?.catalog_id) return { ok: false as const, error: 'not_found' as CatalogError };
  const c = await adminDb().doc(`${CATALOG}/${f.catalog_id}`).get();
  if (!c.exists) return { ok: false as const, error: 'not_found' as CatalogError };
  // set + merge: the per-format prices removed from the catalog are deleted inside the map
  await fref.set({ ...pricePatch(catalogOf(c)), price_override: false, updated_at: new Date().toISOString() }, { merge: true });
  return { ok: true as const };
}

/** The league field becomes PRIVATE (keeps its data). A pending proposal of this league is withdrawn. */
export async function unlinkField(leagueId: string, fieldId: string) {
  const db = adminDb();
  const fref = leagueDb(leagueId).doc(`sport_fields/${fieldId}`);
  const f = (await fref.get()).data() as SportField | undefined;
  if (!f?.catalog_id) return { ok: false as const, error: 'not_found' as CatalogError };
  const cref = db.doc(`${CATALOG}/${f.catalog_id}`);
  const c = await cref.get();
  const batch = db.batch();
  batch.update(fref, { catalog_id: FieldValue.delete(), catalog_status: FieldValue.delete(), price_override: FieldValue.delete(), updated_at: new Date().toISOString() });
  if (c.exists) {
    const data = catalogOf(c);
    const others = Object.keys(data.linked || {}).filter((k) => k !== linkKey(leagueId, fieldId));
    if (data.status === 'pending' && data.proposed_by.leagueId === leagueId && others.length === 0) batch.delete(cref);
    else batch.update(cref, { [`linked.${linkKey(leagueId, fieldId)}`]: FieldValue.delete() });
  }
  await batch.commit();
  return { ok: true as const };
}

// ---------- platform staff ----------

/** Every entry for the console: pending first, then approved (with how many leagues use it). */
export async function listForStaff(): Promise<CatalogView[]> {
  const snap = await adminDb().collection(CATALOG).where('status', 'in', ['pending', 'approved']).get();
  return snap.docs
    .map((d) => publicView(catalogOf(d)))
    .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || a.name.localeCompare(b.name));
}

function descPatch(c: CatalogField) {
  const patch: Record<string, unknown> = {};
  CATALOG_DESC_KEYS.forEach((k) => (patch[k] = c[k] ? c[k] : FieldValue.delete()));
  return patch;
}
function pricePatch(c: CatalogField) {
  const costs: Record<string, unknown> = {};
  BIG.forEach((f) => (costs[f] = c.default_costs?.[f] ? c.default_costs[f] : FieldValue.delete()));
  return { cost: c.default_cost ? c.default_cost : FieldValue.delete(), costs };
}

/** Writes the catalog data into every linked league field (prices only where the league did not set its own). */
async function spread(c: CatalogField, extra: Record<string, unknown> = {}) {
  const db = adminDb();
  const keys = Object.keys(c.linked || {});
  const gone: string[] = [];
  for (let i = 0; i < keys.length; i += 200) {
    const batch = db.batch();
    const part = keys.slice(i, i + 200);
    const refs = part.map((k) => {
      const [leagueId, fieldId] = k.split(':');
      return leagueDb(leagueId).doc(`sport_fields/${fieldId}`);
    });
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, j) => {
      if (!s.exists) return gone.push(part[j]);
      const own = (s.data() as SportField).price_override === true;
      batch.set(s.ref, { ...descPatch(c), ...(own ? {} : pricePatch(c)), ...extra, updated_at: new Date().toISOString() }, { merge: true });
    });
    await batch.commit();
  }
  // League fields deleted in the meantime: drop them from the list
  if (gone.length) await db.doc(`${CATALOG}/${c.id}`).update(Object.fromEntries(gone.map((k) => [`linked.${k}`, FieldValue.delete()])));
}

function applyEdits(c: CatalogField, input: FieldInput | null): CatalogField {
  if (!input) return c;
  const next: CatalogField = { ...c, name: input.name, address: input.address, dedup_key: dedupKey(input.name, input.address) };
  (['maps_url', 'phone', 'court_type', 'notes'] as const).forEach((k) => {
    if (input[k]) next[k] = input[k];
    else delete next[k];
  });
  if (input.cost) next.default_cost = input.cost;
  else delete next.default_cost;
  if (input.costs) next.default_costs = input.costs;
  else delete next.default_costs;
  return next;
}

/** Catalog document as stored (removed optional values become deletions). */
function storedPatch(c: CatalogField): Record<string, unknown> {
  const out: Record<string, unknown> = { name: c.name, address: c.address, dedup_key: c.dedup_key, status: c.status };
  (['maps_url', 'phone', 'court_type', 'notes', 'default_cost', 'default_costs'] as const).forEach(
    (k) => (out[k] = c[k] !== undefined ? c[k] : FieldValue.delete())
  );
  return out;
}

async function getEntry(id: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const s = await adminDb().doc(`${CATALOG}/${id}`).get();
  return s.exists ? catalogOf(s) : null;
}

/** Approve a pending entry (optionally corrected first): visible to every league, linked fields follow. */
export async function approveField(id: string, by: string, edits?: unknown) {
  const c = await getEntry(id);
  if (!c) return { ok: false as const, error: 'not_found' as CatalogError };
  if (c.status !== 'pending') return { ok: false as const, error: 'not_pending' as CatalogError };
  const input = edits === undefined ? null : cleanFieldInput(edits);
  if (edits !== undefined && !input) return { ok: false as const, error: 'bad_request' as CatalogError };
  const next = { ...applyEdits(c, input), status: 'approved' as const };
  const now = new Date().toISOString();
  await adminDb().doc(`${CATALOG}/${id}`).update({ ...storedPatch(next), reviewed_by: { profileId: by, at: now, outcome: 'approved' }, updated_at: now });
  await spread(next, { catalog_status: 'approved' });
  await sendToProfiles([c.proposed_by.profileId], { title: '🏟️ Campo approvato', body: `"${next.name}" ora è nel catalogo di tutte le leghe.`, url: '/settings?sezione=campi' }).catch(() => 0);
  return { ok: true as const };
}

/** Correct an approved (or pending) entry: the linked league fields follow. */
export async function editField(id: string, edits: unknown) {
  const c = await getEntry(id);
  if (!c) return { ok: false as const, error: 'not_found' as CatalogError };
  const input = cleanFieldInput(edits);
  if (!input) return { ok: false as const, error: 'bad_request' as CatalogError };
  const next = applyEdits(c, input);
  await adminDb().doc(`${CATALOG}/${id}`).update({ ...storedPatch(next), updated_at: new Date().toISOString() });
  await spread(next);
  return { ok: true as const };
}

/** Every linked league field becomes a private copy (data kept). */
async function unlinkAll(c: CatalogField) {
  const db = adminDb();
  const keys = Object.keys(c.linked || {});
  for (let i = 0; i < keys.length; i += 400) {
    const batch = db.batch();
    const refs = keys.slice(i, i + 400).map((k) => {
      const [leagueId, fieldId] = k.split(':');
      return leagueDb(leagueId).doc(`sport_fields/${fieldId}`);
    });
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => s.exists && batch.update(s.ref, { catalog_id: FieldValue.delete(), catalog_status: FieldValue.delete(), price_override: FieldValue.delete() }));
    await batch.commit();
  }
}

/** Reject a pending entry: the league that proposed it keeps it as a private field. */
export async function rejectField(id: string, by: string) {
  const c = await getEntry(id);
  if (!c) return { ok: false as const, error: 'not_found' as CatalogError };
  if (c.status !== 'pending') return { ok: false as const, error: 'not_pending' as CatalogError };
  await unlinkAll(c);
  const now = new Date().toISOString();
  await adminDb().doc(`${CATALOG}/${id}`).update({ status: 'rejected', linked: {}, reviewed_by: { profileId: by, at: now, outcome: 'rejected' }, updated_at: now });
  await sendToProfiles([c.proposed_by.profileId], { title: 'Campo non aggiunto al catalogo', body: `"${c.name}" resta un campo solo della tua lega.`, url: '/settings?sezione=campi' }).catch(() => 0);
  return { ok: true as const };
}

/** A pending duplicate goes into an approved entry: its leagues are linked to that one, the duplicate disappears. */
export async function mergeField(id: string, intoId: string) {
  const [c, into] = await Promise.all([getEntry(id), getEntry(intoId)]);
  if (!c || !into || id === intoId) return { ok: false as const, error: 'not_found' as CatalogError };
  if (c.status !== 'pending') return { ok: false as const, error: 'not_pending' as CatalogError };
  if (into.status !== 'approved') return { ok: false as const, error: 'not_approved' as CatalogError };
  const db = adminDb();
  await db.doc(`${CATALOG}/${intoId}`).update({ ...Object.fromEntries(Object.keys(c.linked || {}).map((k) => [`linked.${k}`, true])), updated_at: new Date().toISOString() });
  await spread({ ...into, linked: c.linked || {} }, { catalog_id: intoId, catalog_status: 'approved' });
  await db.doc(`${CATALOG}/${id}`).delete();
  await sendToProfiles([c.proposed_by.profileId], { title: '🏟️ Campo approvato', body: `"${c.name}" era già nel catalogo come "${into.name}": la tua lega ora usa quello.`, url: '/settings?sezione=campi' }).catch(() => 0);
  return { ok: true as const };
}

/** Delete an entry: every league that used it keeps a private copy. */
export async function deleteCatalogField(id: string) {
  const c = await getEntry(id);
  if (!c) return { ok: false as const, error: 'not_found' as CatalogError };
  await unlinkAll(c);
  await adminDb().doc(`${CATALOG}/${id}`).delete();
  return { ok: true as const };
}
