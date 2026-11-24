/**
 * Integration: "Bacheca Avvisi / Cerco Giocatore" (docs/ARCHITECTURE.md §3.5). Real route handler on the Firestore
 * and Auth EMULATORS: who manages a notice, who takes a spot, no overbooking, isolation from the league.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth } from '@/lib/firebase/admin';
import { POST as notices } from '@/app/api/match-notices/route';
import { assertEmulators, call, db, futureDate, idToken, ldb, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

const DAY = futureDate(4);
const notice = (extra: Record<string, unknown> = {}) => ({
  matchId: DAY,
  dateTime: `${DAY}T19:30:00.000Z`,
  locationName: 'Campo Luini',
  address: 'Via Luini 5, Milano',
  format: '5v5',
  totalFieldCost: 80,
  costPerPlayer: 8,
  spotsNeeded: 2,
  roleNeeded: 'ANY',
  shirtColor: 'DARK',
  ...extra,
});

/** A verified account with a global profile but NO league (or a platform role) */
async function outsider(uid: string, extra: Record<string, unknown> = {}) {
  const u = await makeUser(uid, {}, { withProfile: false });
  await db().doc(`profiles/${uid}`).set(profileDoc(uid, { full_name: `Esterno ${uid}`, ...extra }));
  return u;
}

let pres: { uid: string; token: string };
const create = async (token: string, extra: Record<string, unknown> = {}) => call(notices, { action: 'create', notice: notice(extra) }, token);
const take = (id: string, token: string) => call(notices, { action: 'take', id }, token);
const read = async (id: string) => (await db().doc(`match_notices/${id}`).get()).data()!;

beforeEach(async () => {
  await resetEmulators();
  pres = await makeUser('pres', { role: 'admin', full_name: 'Presidente' });
});

describe('Avvisi: chi li gestisce', () => {
  it('presidente, collaboratore e staff della piattaforma creano; giocatori ed esterni no', async () => {
    const res = await create(pres.token);
    expect(res.data.ok).toBe(true);
    const n = await read(String(res.data.id));
    expect(n).toMatchObject({ leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: DAY, status: 'OPEN', spotsFilled: 0, spotsNeeded: 2 });
    expect(n.createdBy).toEqual({ profileId: 'pres', name: 'Presidente' });

    const coll = await makeUser('coll', {});
    await ldb().doc('players/coll').update({ leagueRole: 'COLLABORATOR' });
    expect((await create(coll.token)).data.ok).toBe(true);

    const ga = await outsider('ga', { platformRole: 'GLOBAL_ADMIN' });
    expect((await create(ga.token)).data.ok).toBe(true);

    const player = await makeUser('player', {});
    expect((await create(player.token)).status).toBe(403);
    const out = await outsider('out');
    expect((await create(out.token)).status).toBe(403);
  });

  it('dati sbagliati o partita già passata: rifiutato', async () => {
    expect((await create(pres.token, { format: '6v6' })).status).toBe(400);
    expect((await create(pres.token, { costPerPlayer: 100 })).status).toBe(400);
    const past = futureDate(-2);
    expect((await create(pres.token, { matchId: past, dateTime: `${past}T19:30:00.000Z` })).data.error).toBe('expired');
  });

  it('il presidente di un’altra lega non tocca l’avviso', async () => {
    const id = String((await create(pres.token)).data.id);
    await db().doc('leagues/altra').set({ id: 'altra', name: 'Altra lega', status: 'active' });
    const other = await outsider('other');
    await db().doc('leagues/altra/players/other').set({ id: 'other', userId: 'other', leagueRole: 'PRESIDENT' });
    await db().doc('memberships/other').set({ leagues: { altra: { player_id: 'other', league_role: 'PRESIDENT' } } });
    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 5 } }, other.token)).status).toBe(403);
    expect((await call(notices, { action: 'cancel', id }, other.token)).status).toBe(403);
    expect((await read(id)).status).toBe('OPEN');
  });
});

describe('Prendi il posto', () => {
  it('un esterno prende un posto: niente lega, i gestori lo sanno, non due volte', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    const res = await take(id, out.token);
    expect(res.data).toMatchObject({ ok: true, spotsFilled: 1, status: 'OPEN' });

    const spot = (await db().doc(`match_notices/${id}/applicants/out`).get()).data()!;
    expect(spot).toMatchObject({ profileId: 'out', userId: 'out', displayName: 'Esterno out' });
    // Isolation: no membership, no card in the league
    expect((await db().doc('memberships/out').get()).exists).toBe(false);
    expect((await ldb().doc('players/out').get()).exists).toBe(false);
    const bell = (await db().collection('profiles/pres/notifications').get()).docs.map((d) => String(d.data().body));
    expect(bell.some((b) => b.includes('Esterno out ha preso un posto') && b.includes('Manca 1 posto'))).toBe(true);

    expect((await take(id, out.token)).data.error).toBe('already_joined');
    expect((await read(id)).spotsFilled).toBe(1);
  });

  it('senza email verificata: niente posto', async () => {
    const id = String((await create(pres.token)).data.id);
    await adminAuth().createUser({ uid: 'nover', email: 'nover@example.com', password: 'password123', emailVerified: false });
    await db().doc('profiles/nover').set(profileDoc('nover'));
    expect((await take(id, await idToken('nover@example.com'))).status).toBe(403);
  });

  it('chi è già iscritto a quella partita nella lega non prende il posto', async () => {
    const id = String((await create(pres.token)).data.id);
    const player = await makeUser('player', {});
    await ldb().doc(`presences/${DAY}_player`).set({ id: `${DAY}_player`, date: DAY, player_id: 'player' });
    expect((await take(id, player.token)).data.error).toBe('already_in_match');
  });

  it('dieci click insieme su due posti: due posti presi, avviso chiuso, nessun overbooking', async () => {
    const id = String((await create(pres.token)).data.id);
    const people = await Promise.all(Array.from({ length: 10 }, (_, i) => outsider(`p${i}`)));
    const results = await Promise.all(people.map((p) => take(id, p.token)));
    expect(results.filter((r) => r.data.ok).length).toBe(2);
    expect(results.filter((r) => !r.data.ok).every((r) => r.data.error === 'full' && r.status === 409)).toBe(true);
    const n = await read(id);
    expect(n).toMatchObject({ spotsFilled: 2, status: 'CLOSED', closedReason: 'full' });
    expect((await db().collection(`match_notices/${id}/applicants`).get()).size).toBe(2);
  });
});

describe('Modifica, chiusura, annullamento', () => {
  it('mai sotto i posti presi; aggiungere posti riapre un avviso pieno', async () => {
    const id = String((await create(pres.token, { spotsNeeded: 1 })).data.id);
    await take(id, (await outsider('out')).token);
    expect((await read(id)).status).toBe('CLOSED');

    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 0 } }, pres.token)).status).toBe(400);
    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 3, matchId: '2030-01-01' } }, pres.token)).data.ok).toBe(true);
    expect(await read(id)).toMatchObject({ status: 'OPEN', closedReason: null, spotsNeeded: 3, spotsFilled: 1, matchId: DAY });

    const player = await makeUser('player', {});
    expect((await call(notices, { action: 'update', id, notice: { spotsNeeded: 9 } }, player.token)).status).toBe(403);
  });

  it('chiuso a mano o annullato: nessuno prende più il posto', async () => {
    const id = String((await create(pres.token)).data.id);
    const out = await outsider('out');
    expect((await call(notices, { action: 'close', id }, pres.token)).data.ok).toBe(true);
    expect((await take(id, out.token)).data.error).toBe('not_open');
    expect((await call(notices, { action: 'cancel', id }, pres.token)).data.ok).toBe(true);
    expect((await take(id, out.token)).data.error).toBe('cancelled');
    expect((await call(notices, { action: 'update', id, notice: { notes: 'x' } }, pres.token)).data.error).toBe('cancelled');
  });

  it('lega sospesa: i membri non creano, nessuno prende posti; lo staff gestisce ancora', async () => {
    const id = String((await create(pres.token)).data.id);
    await db().doc('leagues/calcettari').update({ status: 'suspended' });
    expect((await create(pres.token)).status).toBe(423);
    expect((await take(id, (await outsider('out')).token)).status).toBe(423);
    const ga = await outsider('ga', { platformRole: 'GLOBAL_ADMIN' });
    expect((await call(notices, { action: 'cancel', id }, ga.token)).data.ok).toBe(true);
  });
});
