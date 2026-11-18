/**
 * Integration (multi-league 1B): the server works inside the league of the request, roles come from the league
 * card (not from the old global `role`), new accounts join "I Calcettari", closing an account touches every league.
 * Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as resolveRequest } from '@/app/api/admin/requests/route';
import { POST as closeAccount } from '@/app/api/account/delete/route';
import { POST as notify } from '@/app/api/notify/route';
import { adminProfileIds } from '@/lib/server/push';
import { inLeague } from '@/lib/server/leagueScope';
import { assertEmulators, call, db, ldb, makeUser, resetEmulators } from './helpers';

assertEmulators();

beforeEach(async () => {
  await resetEmulators();
});

describe('Lega attiva sul server', () => {
  it('il ruolo vale nella lega: admin "globale" ma giocatore nella lega → niente; collaboratore → sì', async () => {
    const u = await makeUser('c1', { role: 'player' });
    await db().doc('profiles/c1').update({ role: 'admin' }); // vecchio ruolo globale: non conta più
    await ldb().doc('admin_requests/x').set({ type: 'new_signup', status: 'open', profile_id: 'zz', name: 'Z' });
    expect((await call(resolveRequest, { id: 'x', action: 'new' }, u.token)).status).toBe(403);

    await ldb().doc('players/c1').update({ leagueRole: 'COLLABORATOR' });
    expect((await call(resolveRequest, { id: 'x', action: 'new' }, u.token)).data.ok).toBe(true);
    expect((await adminProfileIds()).sort()).toEqual(['c1']);
  });

  it('una lega di cui non si è membri: rifiutato anche se presidente in un\'altra', async () => {
    const u = await makeUser('pres', { role: 'admin' });
    await db().doc('leagues/other').set({ id: 'other', name: 'Altra', status: 'active' });
    const asOther = { 'x-league-id': 'other' };
    expect((await call(notify, { type: 'reconcile', date: '2026-01-01' }, u.token, undefined, asOther)).status).toBe(403);
    expect((await call(notify, { type: 'admin_devices' }, u.token, undefined, asOther)).status).toBe(403);
    // nella propria lega sì
    expect((await call(notify, { type: 'admin_devices' }, u.token)).data.ok).toBe(true);
  });

  it('i dati letti e scritti dal server sono quelli della lega della richiesta', async () => {
    await db().doc('leagues/other').set({ id: 'other', name: 'Altra', status: 'active' });
    await db().doc('leagues/other/players/o1').set({ id: 'o1', leagueRole: 'PRESIDENT' });
    await ldb().doc('players/k1').set({ id: 'k1', leagueRole: 'PRESIDENT' });
    expect(await inLeague('other', () => adminProfileIds())).toEqual(['o1']);
    expect(await inLeague('calcettari', () => adminProfileIds())).toEqual(['k1']);
    expect(await inLeague('../../profiles', () => adminProfileIds())).toEqual(['k1']); // id non valido → lega di base
  });

  it('chiudere l’account lo nasconde in ogni lega e toglie le iscrizioni future da tutte', async () => {
    const u = await makeUser('m1', { full_name: 'Mario' });
    await db().doc('leagues/other').set({ id: 'other', name: 'Altra', status: 'active' });
    await db().doc('leagues/other/players/m1').set({ id: 'm1', userId: 'm1', leagueRole: 'PLAYER' });
    const day = new Date(Date.now() + 5 * 864e5).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    await ldb().doc(`presences/${day}_m1`).set({ date: day, player_id: 'm1' });
    await db().doc(`leagues/other/presences/${day}_m1`).set({ date: day, player_id: 'm1' });

    expect((await call(closeAccount, { mode: 'deactivate', reason: 'Altro' }, u.token)).data.ok).toBe(true);
    expect((await ldb().doc('players/m1').get()).data()?.deactivated_at).toBeTruthy();
    expect((await db().doc('leagues/other/players/m1').get()).data()?.deactivated_at).toBeTruthy();
    expect((await ldb().doc(`presences/${day}_m1`).get()).exists).toBe(false);
    expect((await db().doc(`leagues/other/presences/${day}_m1`).get()).exists).toBe(false);
  });
});
