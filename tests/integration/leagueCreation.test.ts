/**
 * Integration (multi-league step 2): creating a league. The creator becomes president (playing or only organising),
 * keeps the leagues they were already in, and gets the default parameters. Firestore + Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth } from '@/lib/firebase/admin';
import { POST as createLeague } from '@/app/api/leagues/route';
import { MAX_LEAGUES_PER_USER, parseNewLeague } from '@/lib/server/leagueCreation';
import { assertEmulators, call, db, idToken, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

beforeEach(async () => {
  await resetEmulators();
});

describe('Creazione di una lega', () => {
  it('il creatore diventa presidente; la lega ha i parametri di base e il campo abituale', async () => {
    const u = await makeUser('c1', { full_name: 'Carla', position: 'Punta' });
    const res = await call(createLeague, { name: '  Calcetto  del giovedì ', visibility: 'public', defaultFormat: '7v7', defaultLocation: 'Centro Rossi', joinAsPlayer: false }, u.token);
    expect(res.status).toBe(200);
    const id = String(res.data.id);
    expect(id).toMatch(/^calcetto-del-giovedi-[0-9a-f]{6}$/);

    expect((await db().doc(`leagues/${id}`).get()).data()).toMatchObject({
      id, name: 'Calcetto del giovedì', slug: 'calcetto-del-giovedi', status: 'active', visibility: 'public', defaultFormat: '7v7', defaultLocation: 'Centro Rossi', createdBy: 'c1',
    });
    const card = (await db().doc(`leagues/${id}/players/c1`).get()).data();
    expect(card).toMatchObject({ userId: 'c1', leagueRole: 'PRESIDENT', isActivePlayer: false, full_name: 'Carla', position: 'Punta', matches_won: 0, is_guest: false });
    expect(card).not.toHaveProperty('email');
    expect((await db().collection(`leagues/${id}/stat_categories`).get()).size).toBe(8);
    expect((await db().doc(`leagues/${id}/sport_fields/f1`).get()).data()?.name).toBe('Centro Rossi');
    expect((await db().doc(`leagues/${id}/settings/app_config`).get()).data()?.default_field_id).toBe('f1');

    // resta nei Calcettari e in più è presidente della nuova lega
    const m = (await db().doc('memberships/c1').get()).data()?.leagues;
    expect(Object.keys(m).sort()).toEqual(['calcettari', id].sort());
    expect(m[id]).toMatchObject({ player_id: 'c1', league_role: 'PRESIDENT', name: 'Calcetto del giovedì' });
    // i dati dei Calcettari non cambiano
    expect((await db().doc('leagues/calcettari/players/c1').get()).data()?.leagueRole).toBe('PLAYER');
  });

  it('di base: privata, il creatore gioca, nessun campo', async () => {
    const u = await makeUser('c2', {});
    const id = String((await call(createLeague, { name: 'Amici' }, u.token)).data.id);
    expect((await db().doc(`leagues/${id}`).get()).data()).toMatchObject({ visibility: 'private' });
    expect((await db().doc(`leagues/${id}/players/c2`).get()).data()?.isActivePlayer).toBe(true);
    expect((await db().collection(`leagues/${id}/sport_fields`).get()).size).toBe(0);
  });

  it('due leghe con lo stesso nome hanno id diversi', async () => {
    const u = await makeUser('c3', {});
    const a = (await call(createLeague, { name: 'Amici' }, u.token)).data.id;
    const b = (await call(createLeague, { name: 'Amici' }, u.token)).data.id;
    expect(a).not.toBe(b);
  });

  it(`al massimo ${MAX_LEAGUES_PER_USER} leghe create a testa`, async () => {
    const u = await makeUser('c4', {});
    for (let i = 0; i < MAX_LEAGUES_PER_USER; i++) expect((await call(createLeague, { name: `Lega ${i}` }, u.token)).status).toBe(200);
    const over = await call(createLeague, { name: 'Una di troppo' }, u.token);
    expect(over.status).toBe(429);
    expect(over.data.error).toBe('too_many');
  });

  it('serve un accesso con email verificata e un nome valido', async () => {
    expect((await call(createLeague, { name: 'Senza login' })).status).toBe(401);
    await adminAuth().createUser({ uid: 'nv', email: 'nv@example.com', password: 'password123', emailVerified: false });
    await db().doc('profiles/nv').set(profileDoc('nv'));
    expect((await call(createLeague, { name: 'Non verificato' }, await idToken('nv@example.com'))).status).toBe(403);
    const u = await makeUser('c5', {});
    expect((await call(createLeague, { name: 'x' }, u.token)).status).toBe(400);
    expect((await call(createLeague, { name: 'Ok', visibility: 'segreta' }, u.token)).status).toBe(400);
    expect((await call(createLeague, { name: 'Ok', defaultFormat: '9v9' }, u.token)).status).toBe(400);
    expect((await call(createLeague, { name: '!!!' }, u.token)).status).toBe(400);
  });

  it('controllo dei dati ricevuti', () => {
    expect(parseNewLeague({ name: 'A'.repeat(49) })).toBeNull();
    expect(parseNewLeague({ name: 'Lega', defaultLocation: ' '.repeat(3) })).toMatchObject({ name: 'Lega', visibility: 'private', joinAsPlayer: true });
    expect(parseNewLeague({ name: 'Lega', defaultFormat: '' })?.defaultFormat).toBeUndefined();
  });
});
