/**
 * Integration: global fields catalog (docs/ARCHITECTURE.md §3.3). A league proposes a pitch (usable at once),
 * the platform staff approve / correct / reject / merge / delete, other leagues add it linked, corrections spread
 * (prices only where the league did not set its own). Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as catalogGet, POST as catalogPost } from '@/app/api/field-catalog/route';
import { GET as staffGet, POST as staffPost } from '@/app/api/super-admin/fields/route';
import { assertEmulators, call, db, ldb, makeUser, resetEmulators } from './helpers';

assertEmulators();

const B = 'giovedi';
const asB = { 'x-league-id': B };
const catUrl = 'http://localhost/api/field-catalog';
const staffUrl = 'http://localhost/api/super-admin/fields';
const LUINI = { name: 'Campo Luini', address: 'Via Luini 5, Milano', cost: 80, costs: { '7v7': 110 } };

let presA: { uid: string; token: string };
let presB: { uid: string; token: string };
let staff: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulators();
  presA = await makeUser('presa', { role: 'admin', full_name: 'Pres A' });
  presB = await makeUser('presb', { full_name: 'Pres B' }, { withProfile: true });
  await db().doc(`leagues/${B}`).set({ id: B, name: 'Lega del giovedì', status: 'active', visibility: 'private' });
  await db().doc(`leagues/${B}/players/presb`).set({ id: 'presb', userId: 'presb', full_name: 'Pres B', leagueRole: 'PRESIDENT', is_guest: false });
  await db().doc('memberships/presb').set({ leagues: { [B]: { player_id: 'presb', league_role: 'PRESIDENT', name: 'Lega del giovedì' } } }, { merge: true });
  staff = await makeUser('ga', { platformRole: 'GLOBAL_ADMIN' });
});

const leagueFields = async (leagueId: string) => (await db().collection(`leagues/${leagueId}/sport_fields`).get()).docs.map((d) => d.data());

describe('Catalogo globale dei campi', () => {
  it('proposta usabile subito → approvazione con correzione → un’altra lega lo aggiunge collegato', async () => {
    const player = await makeUser('pl', {});
    expect((await call(catalogPost, { action: 'propose', field: LUINI }, player.token)).status).toBe(403);
    const prop = await call(catalogPost, { action: 'propose', field: LUINI }, presA.token);
    expect(prop.data.ok).toBe(true);
    const catalogId = prop.data.catalogId as string;

    // subito nella lega A, segnato in attesa; il catalogo ce l'ha in attesa
    const a = (await ldb().doc(`sport_fields/${prop.data.fieldId}`).get()).data();
    expect(a).toMatchObject({ name: 'Campo Luini', cost: 80, catalog_id: catalogId, catalog_status: 'pending', price_override: false });
    expect((await db().doc(`field_catalog/${catalogId}`).get()).data()).toMatchObject({ status: 'pending', proposed_by: { leagueId: 'calcettari' } });
    // la lega B non lo vede ancora; il doppione viene segnalato prima di proporre
    expect((await call(catalogGet, undefined, presB.token, catUrl, asB)).data.approved).toEqual([]);
    const sim = await call(catalogPost, { action: 'similar', field: { name: 'campo luini', address: 'V. Luini 5 Milano' } }, presB.token, undefined, asB);
    expect((sim.data.similar as { id: string }[]).map((s) => s.id)).toEqual([catalogId]);
    // la lega B non può aggiungerlo finché è in attesa
    expect((await call(catalogPost, { action: 'add', catalogId }, presB.token, undefined, asB)).data.error).toBe('not_approved');

    // lo staff lo vede e lo approva correggendo il nome
    expect((await call(staffGet, undefined, presA.token, staffUrl)).status).toBe(403);
    const pending = (await call(staffGet, undefined, staff.token, staffUrl)).data.fields as { id: string; status: string }[];
    expect(pending.map((f) => [f.id, f.status])).toEqual([[catalogId, 'pending']]);
    expect((await call(staffPost, { id: catalogId, action: 'approve', field: { ...LUINI, name: 'Centro Sportivo Luini' } }, staff.token)).data.ok).toBe(true);
    expect((await ldb().doc(`sport_fields/${prop.data.fieldId}`).get()).data()).toMatchObject({ name: 'Centro Sportivo Luini', catalog_status: 'approved' });
    const bell = await db().collection('profiles/presa/notifications').get();
    expect(bell.docs.some((d) => String(d.data().title).includes('approvato'))).toBe(true);

    // la lega B lo vede e lo aggiunge (una sola volta)
    const list = await call(catalogGet, undefined, presB.token, catUrl, asB);
    expect((list.data.approved as { name: string }[]).map((f) => f.name)).toEqual(['Centro Sportivo Luini']);
    const add = await call(catalogPost, { action: 'add', catalogId }, presB.token, undefined, asB);
    expect(add.data).toMatchObject({ ok: true, existing: false });
    expect((await call(catalogPost, { action: 'add', catalogId }, presB.token, undefined, asB)).data).toMatchObject({ ok: true, existing: true });
    const [bField] = await leagueFields(B);
    expect(bField).toMatchObject({ name: 'Centro Sportivo Luini', address: 'Via Luini 5, Milano', cost: 80, costs: { '7v7': 110 }, catalog_id: catalogId, price_override: false });
  });

  it('le correzioni dello staff arrivano a tutte le leghe; il prezzo solo dove la lega non ha messo il suo', async () => {
    const { data } = await call(catalogPost, { action: 'propose', field: LUINI }, presA.token);
    const catalogId = data.catalogId as string;
    await call(staffPost, { id: catalogId, action: 'approve' }, staff.token);
    const add = await call(catalogPost, { action: 'add', catalogId }, presB.token, undefined, asB);
    // la lega B mette un suo prezzo (come fa l'app: solo prezzo, note e price_override)
    await db().doc(`leagues/${B}/sport_fields/${add.data.fieldId}`).update({ cost: 100, price_override: true });

    expect((await call(staffPost, { id: catalogId, action: 'edit', field: { ...LUINI, address: 'Via Luini 7, Milano', cost: 90 } }, staff.token)).data.ok).toBe(true);
    expect((await ldb().doc(`sport_fields/${data.fieldId}`).get()).data()).toMatchObject({ address: 'Via Luini 7, Milano', cost: 90 });
    expect((await db().doc(`leagues/${B}/sport_fields/${add.data.fieldId}`).get()).data()).toMatchObject({ address: 'Via Luini 7, Milano', cost: 100 });
    // il catalogo non è stato toccato dal prezzo della lega B
    expect((await db().doc(`field_catalog/${catalogId}`).get()).data()?.default_cost).toBe(90);

    // torna al prezzo del catalogo, poi scollega: resta un campo privato con i suoi dati
    expect((await call(catalogPost, { action: 'reset_price', fieldId: add.data.fieldId }, presB.token, undefined, asB)).data.ok).toBe(true);
    expect((await db().doc(`leagues/${B}/sport_fields/${add.data.fieldId}`).get()).data()).toMatchObject({ cost: 90, price_override: false });
    expect((await call(catalogPost, { action: 'unlink', fieldId: add.data.fieldId }, presB.token, undefined, asB)).data.ok).toBe(true);
    const b = (await db().doc(`leagues/${B}/sport_fields/${add.data.fieldId}`).get()).data()!;
    expect(b.catalog_id).toBeUndefined();
    expect(b.name).toBe('Campo Luini');
    expect(Object.keys((await db().doc(`field_catalog/${catalogId}`).get()).data()?.linked || {})).toEqual([`calcettari:${data.fieldId}`]);
  });

  it('rifiuto: resta privato della lega; doppione: unito a quello approvato; eliminazione: copie private', async () => {
    const first = await call(catalogPost, { action: 'propose', field: LUINI }, presA.token);
    await call(staffPost, { id: first.data.catalogId, action: 'approve' }, staff.token);

    const other = await call(catalogPost, { action: 'propose', field: { name: 'Oratorio San Luigi', address: 'Via Roma 1, Monza' } }, presB.token, undefined, asB);
    expect((await call(staffPost, { id: other.data.catalogId, action: 'reject' }, staff.token)).data.ok).toBe(true);
    const rejected = (await db().doc(`leagues/${B}/sport_fields/${other.data.fieldId}`).get()).data()!;
    expect(rejected.catalog_id).toBeUndefined();
    expect(rejected.name).toBe('Oratorio San Luigi');
    expect(((await call(catalogGet, undefined, presB.token, catUrl, asB)).data.mine as { status: string }[]).map((m) => m.status)).toEqual(['rejected']);

    const dup = await call(catalogPost, { action: 'propose', field: { name: 'campo  luini', address: 'Via Luini 5, Milano' } }, presB.token, undefined, asB);
    expect((await call(staffPost, { id: dup.data.catalogId, action: 'merge', intoId: first.data.catalogId }, staff.token)).data.ok).toBe(true);
    expect((await db().doc(`field_catalog/${dup.data.catalogId}`).get()).exists).toBe(false);
    expect((await db().doc(`leagues/${B}/sport_fields/${dup.data.fieldId}`).get()).data()).toMatchObject({ catalog_id: first.data.catalogId, catalog_status: 'approved', name: 'Campo Luini' });

    // un utente qualunque non tocca il catalogo; lo staff elimina: ogni lega tiene la sua copia privata
    expect((await call(staffPost, { id: first.data.catalogId, action: 'delete' }, presA.token)).status).toBe(403);
    expect((await call(staffPost, { id: first.data.catalogId, action: 'delete' }, staff.token)).data.ok).toBe(true);
    for (const f of [...(await leagueFields('calcettari')), ...(await leagueFields(B))]) expect(f.catalog_id).toBeUndefined();
  });

  it('un campo privato già della lega va al catalogo come proposta; dati non validi rifiutati', async () => {
    await ldb().doc('sport_fields/old').set({ id: 'old', name: 'Campo Vecchio', address: 'Via Vecchia 2, Milano', cost: 70 });
    expect((await call(catalogPost, { action: 'propose_existing', fieldId: 'old' }, presA.token)).data.ok).toBe(true);
    expect((await ldb().doc('sport_fields/old').get()).data()).toMatchObject({ catalog_status: 'pending', price_override: true, cost: 70 });
    expect((await call(catalogPost, { action: 'propose_existing', fieldId: 'old' }, presA.token)).data.error).toBe('already_linked');
    expect((await call(catalogPost, { action: 'propose', field: { name: '', address: 'x' } }, presA.token)).data.error).toBe('bad_request');
    expect((await call(catalogPost, { action: 'propose', field: { ...LUINI, maps_url: 'javascript:alert(1)' } }, presA.token)).data.error).toBe('bad_request');
  });
});
