/**
 * Integration (security): league managers act ONLY inside their league.
 *  - The global account (deactivate / delete / reactivate someone else) is only for the platform super admin.
 *  - Managers take a member out of THEIR league: card hidden (history kept), access and future sign-ups gone,
 *    the account and the other leagues untouched; an invite brings the same card back.
 *  - Members' emails: only managers of the league, only that league's members (never other leagues).
 * Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as accountDelete } from '@/app/api/account/delete/route';
import { POST as leagueAdmin } from '@/app/api/league-admin/route';
import { GET as leagueEmails } from '@/app/api/league-emails/route';
import { POST as inviteRoute } from '@/app/api/league-invite/route';
import { POST as joinRoute } from '@/app/api/join/route';
import { assertEmulators, call, db, futureDate, ldb, makeUser, resetEmulators } from './helpers';

assertEmulators();

const OTHER = 'other';
const asOther = { 'x-league-id': OTHER };
const emailsUrl = 'http://localhost/api/league-emails';

/** A second league where `uid` has a card with `role`. */
async function inOtherLeague(uid: string, role: 'PRESIDENT' | 'COLLABORATOR' | 'PLAYER') {
  await db().doc(`leagues/${OTHER}`).set({ id: OTHER, name: 'Altra', status: 'active', visibility: 'private' }, { merge: true });
  await db().doc(`leagues/${OTHER}/players/${uid}`).set({ id: uid, userId: uid, full_name: `Altro ${uid}`, leagueRole: role, isActivePlayer: true, is_guest: false });
  await db().doc(`memberships/${uid}`).set({ leagues: { [OTHER]: { player_id: uid, league_role: role, name: 'Altra' } } }, { merge: true });
}

beforeEach(async () => {
  await resetEmulators();
});

describe('Account globale di un altro: solo il super admin', () => {
  it('il presidente di un’altra lega non disattiva né elimina un account; il super admin sì', async () => {
    await makeUser('victim', {}); // membro di "I Calcettari"
    const intruder = await makeUser('intruder', {}, { withProfile: false });
    await db().doc('profiles/intruder').set({ id: 'intruder', user_id: 'intruder', full_name: 'Intruso', role: 'player', is_guest: false });
    await inOtherLeague('intruder', 'PRESIDENT'); // si è creato una lega sua

    for (const mode of ['deactivate', 'delete', 'reactivate']) {
      expect((await call(accountDelete, { targetProfileId: 'victim', mode }, intruder.token, undefined, asOther)).status).toBe(403);
    }
    // nemmeno il presidente della STESSA lega tocca l'account globale
    const pres = await makeUser('pres', { role: 'admin' });
    expect((await call(accountDelete, { targetProfileId: 'victim', mode: 'deactivate' }, pres.token)).status).toBe(403);
    expect((await db().doc('profiles/victim').get()).data()?.deactivated_at).toBeUndefined();

    const sup = await makeUser('super', { role: 'admin', platformRole: 'SUPER_ADMIN' }, { email: 'macciolino84@gmail.com' });
    expect((await call(accountDelete, { targetProfileId: 'victim', mode: 'deactivate' }, sup.token)).data.ok).toBe(true);
    expect((await db().doc('profiles/victim').get()).data()?.deactivated_at).toBeTruthy();
  });

  it('il proprietario chiude ancora il proprio account', async () => {
    const me = await makeUser('me', {});
    expect((await call(accountDelete, { mode: 'deactivate', reason: 'Altro' }, me.token)).data.ok).toBe(true);
    expect((await db().doc('profiles/me').get()).data()?.deactivated_at).toBeTruthy();
  });
});

describe('Togliere un membro dalla lega', () => {
  it('il presidente toglie un giocatore: niente accesso né iscrizioni future, account e altre leghe intatti', async () => {
    const pres = await makeUser('pres', { role: 'admin' });
    await makeUser('pl', {});
    await inOtherLeague('pl', 'PLAYER');
    const day = futureDate(3);
    await ldb().doc(`presences/${day}_pl`).set({ date: day, player_id: 'pl' });
    await db().doc(`leagues/${OTHER}/presences/${day}_pl`).set({ date: day, player_id: 'pl' });

    expect((await call(leagueAdmin, { action: 'remove', playerId: 'pl' }, pres.token)).data.ok).toBe(true);

    const card = (await ldb().doc('players/pl').get()).data();
    expect(card).toMatchObject({ leagueRole: 'PLAYER', isActivePlayer: false, removed_by: 'pres' });
    expect(card?.removed_at).toBeTruthy();
    const leagues = (await db().doc('memberships/pl').get()).data()?.leagues;
    expect(Object.keys(leagues)).toEqual([OTHER]);
    expect((await ldb().doc(`presences/${day}_pl`).get()).exists).toBe(false);
    expect((await db().doc(`leagues/${OTHER}/presences/${day}_pl`).get()).exists).toBe(true);
    expect((await db().doc('profiles/pl').get()).data()?.deactivated_at).toBeUndefined();
  });

  it('chi può togliere chi: collaboratori solo giocatori, presidenti mai, nessuno da un’altra lega', async () => {
    const pres = await makeUser('pres', { role: 'admin' });
    const coll = await makeUser('coll', {});
    await ldb().doc('players/coll').update({ leagueRole: 'COLLABORATOR' });
    const coll2 = await makeUser('coll2', {});
    await ldb().doc('players/coll2').update({ leagueRole: 'COLLABORATOR' });
    const player = await makeUser('pl', {});
    await ldb().doc('players/guest-1').set({ id: 'guest-1', is_guest: true, userId: null, leagueRole: 'PLAYER' });

    expect((await call(leagueAdmin, { action: 'remove', playerId: 'coll2' }, player.token)).status).toBe(403); // giocatore
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'coll2' }, coll.token)).status).toBe(403); // collaboratore → collaboratore
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'pres' }, coll.token)).status).toBe(403); // presidente
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'coll' }, coll.token)).status).toBe(403); // se stesso
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'guest-1' }, pres.token)).status).toBe(404); // ospite: si elimina, non si toglie

    // un membro di un'altra lega: dalla mia lega non esiste
    await makeUser('far', {}, { withProfile: false });
    await inOtherLeague('far', 'PLAYER');
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'far' }, pres.token)).status).toBe(404);
    expect(Object.keys((await db().doc('memberships/far').get()).data()?.leagues)).toEqual([OTHER]);

    expect((await call(leagueAdmin, { action: 'remove', playerId: 'pl' }, coll.token)).data.ok).toBe(true); // collaboratore → giocatore
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'coll2' }, pres.token)).data.ok).toBe(true); // presidente → collaboratore
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'pres' }, coll2.token)).status).toBe(403); // tolto: non gestisce più
  });

  it('con un link di invito rientra con la stessa scheda, come giocatore', async () => {
    const pres = await makeUser('pres', { role: 'admin' });
    const pl = await makeUser('pl', {});
    await ldb().doc('players/pl').update({ matches_won: 7 });
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'pl' }, pres.token)).data.ok).toBe(true);

    const code = String((await call(inviteRoute, {}, pres.token)).data.code);
    expect((await call(joinRoute, { code }, pl.token)).data.ok).toBe(true);
    const card = (await ldb().doc('players/pl').get()).data();
    expect(card).toMatchObject({ matches_won: 7, isActivePlayer: true, leagueRole: 'PLAYER' });
    expect(card?.removed_at).toBeUndefined();
    expect((await db().doc('memberships/pl').get()).data()?.leagues?.calcettari?.league_role).toBe('PLAYER');
  });
});

describe('Email dei membri', () => {
  it('solo i gestori, solo i membri della propria lega', async () => {
    const pres = await makeUser('pres', { role: 'admin' });
    const pl = await makeUser('pl', {});
    await db().doc('private_profiles/pl').set({ email: 'pl@example.com' });
    await ldb().doc('players/guest-1').set({ id: 'guest-1', is_guest: true, userId: null });
    // qualcuno che è solo in un'altra lega
    const far = await makeUser('far', {}, { withProfile: false });
    await db().doc('profiles/far').set({ id: 'far', user_id: 'far', full_name: 'Lontano', role: 'player', is_guest: false });
    await db().doc('private_profiles/far').set({ email: 'far@example.com' });
    await inOtherLeague('far', 'PRESIDENT');

    const res = await call(leagueEmails, undefined, pres.token, emailsUrl);
    expect(res.status).toBe(200);
    expect(res.data.emails).toEqual({ pres: 'pres@example.com', pl: 'pl@example.com' }); // pres: email ancora nel profilo (fallback)

    expect((await call(leagueEmails, undefined, pl.token, emailsUrl)).status).toBe(403); // giocatore
    // il presidente dell'altra lega vede solo i suoi…
    expect((await call(leagueEmails, undefined, far.token, emailsUrl, asOther)).data.emails).toEqual({ far: 'far@example.com' });
    // …e chiedendo la lega di altri viene rifiutato
    expect((await call(leagueEmails, undefined, far.token, emailsUrl)).status).toBe(403);
    expect((await call(leagueEmails, undefined, undefined, emailsUrl)).status).toBe(401);

    // tolto dalla lega: la sua email sparisce
    await call(leagueAdmin, { action: 'remove', playerId: 'pl' }, pres.token);
    expect((await call(leagueEmails, undefined, pres.token, emailsUrl)).data.emails).toEqual({ pres: 'pres@example.com' });
  });
});
