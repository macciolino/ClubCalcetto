/**
 * Integration: deleting a league for good. Presidents of that league (typed name) or the platform super admin;
 * every subcollection, invite and membership entry goes away; accounts and other leagues stay; "I Calcettari"
 * can never be deleted. Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as leagueAdmin } from '@/app/api/league-admin/route';
import { POST as platformLeagues } from '@/app/api/super-admin/leagues/route';
import { assertEmulators, call, db, makeUser, resetEmulators } from './helpers';

assertEmulators();

const ID = 'giovedi';
const NAME = 'Lega del giovedì';
const asLeague = { 'x-league-id': ID };

beforeEach(async () => {
  await resetEmulators();
});

/** A second league with a president, a collaborator, a player (all also in "I Calcettari"), a match and an invite. */
async function seedLeague() {
  const pres = await makeUser('pres', {});
  const coll = await makeUser('coll', {});
  const pl = await makeUser('pl', {});
  await db().doc(`leagues/${ID}`).set({ id: ID, name: NAME, status: 'active', visibility: 'private' });
  for (const [uid, role] of [['pres', 'PRESIDENT'], ['coll', 'COLLABORATOR'], ['pl', 'PLAYER']] as const) {
    await db().doc(`leagues/${ID}/players/${uid}`).set({ id: uid, userId: uid, full_name: uid, leagueRole: role, is_guest: false });
    await db().doc(`memberships/${uid}`).set({ leagues: { [ID]: { player_id: uid, league_role: role, name: NAME } } }, { merge: true });
  }
  await db().doc(`leagues/${ID}/matches/2026-11-01`).set({ status: 'completed' });
  await db().doc(`leagues/${ID}/players/guest-1`).set({ id: 'guest-1', is_guest: true, userId: null });
  await db().doc('league_invites/CODE123456').set({ leagueId: ID, revoked: false });
  return { pres, coll, pl };
}

describe('Eliminare una lega', () => {
  it('il presidente con il nome esatto: via tutto, memberships ripulite, altre leghe intatte', async () => {
    const { pres, coll, pl } = await seedLeague();
    expect((await call(leagueAdmin, { action: 'delete', confirmName: NAME }, coll.token, undefined, asLeague)).status).toBe(403);
    expect((await call(leagueAdmin, { action: 'delete', confirmName: NAME }, pl.token, undefined, asLeague)).status).toBe(403);
    expect((await call(leagueAdmin, { action: 'delete', confirmName: 'lega del giovedi' }, pres.token, undefined, asLeague)).data.error).toBe('name_mismatch');

    expect((await call(leagueAdmin, { action: 'delete', confirmName: '  Lega  del giovedì ' }, pres.token, undefined, asLeague)).data.ok).toBe(true);
    expect((await db().doc(`leagues/${ID}`).get()).exists).toBe(false);
    expect((await db().collection(`leagues/${ID}/players`).get()).size).toBe(0);
    expect((await db().collection(`leagues/${ID}/matches`).get()).size).toBe(0);
    expect((await db().doc('league_invites/CODE123456').get()).exists).toBe(false);
    for (const uid of ['pres', 'coll', 'pl']) {
      const leagues = (await db().doc(`memberships/${uid}`).get()).data()?.leagues || {};
      expect(Object.keys(leagues)).toEqual(['calcettari']); // "I Calcettari" resta
      expect((await db().doc(`profiles/${uid}`).get()).exists).toBe(true); // l'account resta
    }
    expect((await db().doc('leagues/calcettari').get()).exists).toBe(true);
  });

  it('"I Calcettari" non si elimina; il super admin elimina dalla console, l’admin piattaforma no', async () => {
    const { pres } = await seedLeague();
    await db().doc('leagues/calcettari/players/pres').update({ leagueRole: 'PRESIDENT' });
    expect((await call(leagueAdmin, { action: 'delete', confirmName: 'I Calcettari' }, pres.token)).data.error).toBe('protected');

    const helper = await makeUser('helper', { platformRole: 'GLOBAL_ADMIN' });
    expect((await call(platformLeagues, { leagueId: ID, action: 'delete', confirmName: NAME }, helper.token)).status).toBe(403);
    const sup = await makeUser('sup', { platformRole: 'SUPER_ADMIN' });
    expect((await call(platformLeagues, { leagueId: 'calcettari', action: 'delete', confirmName: 'I Calcettari' }, sup.token)).data.error).toBe('protected');
    expect((await call(platformLeagues, { leagueId: ID, action: 'delete', confirmName: 'sbagliato' }, sup.token)).data.error).toBe('name_mismatch');
    expect((await call(platformLeagues, { leagueId: ID, action: 'delete', confirmName: NAME }, sup.token)).data.ok).toBe(true);
    expect((await db().doc(`leagues/${ID}`).get()).exists).toBe(false);
    expect(Object.keys((await db().doc('memberships/pres').get()).data()?.leagues || {})).toEqual(['calcettari']);
  });
});
