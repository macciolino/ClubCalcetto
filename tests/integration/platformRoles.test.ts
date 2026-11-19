/**
 * Integration: platform roles come ONLY from profiles.platformRole (never from the email); SUPER_ADMIN and
 * GLOBAL_ADMIN act as PRESIDENT in every league; only SUPER_ADMIN appoints platform admins and touches the
 * reserved system tools; a super admin's account and cards are protected from everyone else.
 * Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listLeagues, POST as setStatus } from '@/app/api/super-admin/leagues/route';
import { GET as listStaff, POST as setStaff } from '@/app/api/super-admin/admins/route';
import { POST as emailPrivacy } from '@/app/api/admin/email-privacy/route';
import { POST as inviteRoute } from '@/app/api/league-invite/route';
import { POST as resolveRequest } from '@/app/api/admin/requests/route';
import { GET as leagueEmails } from '@/app/api/league-emails/route';
import { POST as leagueAdmin } from '@/app/api/league-admin/route';
import { POST as accountDelete } from '@/app/api/account/delete/route';
import { POST as notifyRoute } from '@/app/api/notify/route';
import { adminAuth } from '@/lib/firebase/admin';
import { assertEmulators, call, db, idToken, ldb, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

const leaguesUrl = 'http://localhost/api/super-admin/leagues';
const staffUrl = 'http://localhost/api/super-admin/admins';
const asOther = { 'x-league-id': 'other' };

beforeEach(async () => {
  await resetEmulators();
});

/** The founder's legacy profile p-1 (doc id NOT the uid), like in production. */
async function founder(platformRole: 'SUPER_ADMIN' | 'USER', userId: string | null = null) {
  const user = await adminAuth().createUser({ email: 'macciolino84@gmail.com', password: 'password123', emailVerified: true });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { email, ...p1 } = profileDoc('p-1', { user_id: userId ?? 'old-id', role: 'admin', platformRole });
  await db().doc('profiles/p-1').set(p1);
  return { uid: user.uid, token: await idToken('macciolino84@gmail.com') };
}

describe('Super admin = platformRole, non l’email', () => {
  it('stessa email ma p-1 con platformRole USER: nessun potere', async () => {
    const f = await founder('USER');
    expect((await call(listLeagues, undefined, f.token, leaguesUrl)).status).toBe(403);
    expect((await call(emailPrivacy, {}, f.token)).status).toBe(403);
  });

  it('p-1 con SUPER_ADMIN: riconosciuto, e il suo user_id viene sistemato per le regole', async () => {
    const f = await founder('SUPER_ADMIN');
    expect((await call(listLeagues, undefined, f.token, leaguesUrl)).status).toBe(200);
    expect((await db().doc('profiles/p-1').get()).data()?.user_id).toBe(f.uid);
  });

  it('un altro account con platformRole SUPER_ADMIN lo è, senza bisogno dell’email', async () => {
    const boss = await makeUser('boss2', { platformRole: 'SUPER_ADMIN' });
    expect((await call(listStaff, undefined, boss.token, staffUrl)).status).toBe(200);
  });
});

describe('Admin della piattaforma (GLOBAL_ADMIN)', () => {
  it('il super admin lo nomina per email esatta e lo toglie; l’admin agisce sulle leghe ma non sui ruoli di piattaforma', async () => {
    const sup = await makeUser('sup', { platformRole: 'SUPER_ADMIN' });
    const helper = await makeUser('helper', {});
    expect((await call(setStaff, { email: 'nessuno@example.com', role: 'GLOBAL_ADMIN' }, sup.token)).status).toBe(404);
    expect((await call(setStaff, { email: 'non-una-email', role: 'GLOBAL_ADMIN' }, sup.token)).status).toBe(400);
    expect((await call(setStaff, { email: 'HELPER@example.com', role: 'GLOBAL_ADMIN' }, sup.token)).data.ok).toBe(true);
    expect((await db().doc('profiles/helper').get()).data()?.platformRole).toBe('GLOBAL_ADMIN');

    // vede la console e sospende / riattiva; non nomina, non tocca la privacy (sezione riservata)
    expect((await call(listLeagues, undefined, helper.token, leaguesUrl)).status).toBe(200);
    expect((await call(setStatus, { leagueId: 'calcettari', status: 'suspended' }, helper.token)).data.ok).toBe(true);
    expect((await call(setStatus, { leagueId: 'calcettari', status: 'active' }, helper.token)).data.ok).toBe(true);
    expect((await call(listStaff, undefined, helper.token, staffUrl)).status).toBe(403);
    expect((await call(setStaff, { email: 'sup@example.com', role: 'USER' }, helper.token)).status).toBe(403);
    expect((await call(emailPrivacy, {}, helper.token)).status).toBe(403);

    const staff = (await call(listStaff, undefined, sup.token, staffUrl)).data.staff as { profileId: string; platformRole: string }[];
    expect(staff.map((s) => [s.profileId, s.platformRole])).toEqual([['sup', 'SUPER_ADMIN'], ['helper', 'GLOBAL_ADMIN']]);
    // il super admin non si toglie da qui
    expect((await call(setStaff, { profileId: 'sup', role: 'USER' }, sup.token)).data.error).toBe('protected');
    expect((await call(setStaff, { profileId: 'helper', role: 'USER' }, sup.token)).data.ok).toBe(true);
    expect((await call(listLeagues, undefined, helper.token, leaguesUrl)).status).toBe(403);
  });

  it('un utente qualunque non vede la console', async () => {
    const u = await makeUser('u', {});
    expect((await call(listLeagues, undefined, u.token, leaguesUrl)).status).toBe(403);
  });
});

describe('Staff di piattaforma = presidente in ogni lega', () => {
  it('senza scheda nella lega: inviti, richieste, email dei membri, ruoli; anche se sospesa', async () => {
    await db().doc('leagues/other').set({ id: 'other', name: 'Altra', status: 'active', visibility: 'private' });
    await db().doc('leagues/other/admin_requests/x').set({ type: 'new_signup', status: 'open', profile_id: 'zz', name: 'Z' });
    await db().doc('leagues/other/players/m').set({ id: 'm', userId: 'm', full_name: 'M', leagueRole: 'PLAYER', is_guest: false });
    for (const platformRole of ['SUPER_ADMIN', 'GLOBAL_ADMIN'] as const) {
      const staff = await makeUser(`st-${platformRole}`, { platformRole });
      expect((await call(inviteRoute, {}, staff.token, undefined, asOther)).data.ok).toBe(true);
      expect((await call(leagueEmails, undefined, staff.token, 'http://localhost/api/league-emails', asOther)).data.ok).toBe(true);
      expect((await call(leagueAdmin, { action: 'role', playerId: 'm', role: 'COLLABORATOR' }, staff.token, undefined, asOther)).data.ok).toBe(true);
      expect((await call(leagueAdmin, { action: 'role', playerId: 'm', role: 'PLAYER' }, staff.token, undefined, asOther)).data.ok).toBe(true);
    }
    const ga = await makeUser('ga', { platformRole: 'GLOBAL_ADMIN' });
    expect((await call(resolveRequest, { id: 'x', action: 'new' }, ga.token, undefined, asOther)).data.ok).toBe(true);
    // lega sospesa: i membri sono in sola lettura, lo staff lavora ancora
    await db().doc('leagues/other').update({ status: 'suspended' });
    expect((await call(leagueAdmin, { action: 'role', playerId: 'm', role: 'COLLABORATOR' }, ga.token, undefined, asOther)).data.ok).toBe(true);
    // un utente qualunque, fuori dalla lega: niente
    const u = await makeUser('u', {});
    expect((await call(inviteRoute, {}, u.token, undefined, asOther)).status).toBe(403);
    expect((await call(leagueAdmin, { action: 'role', playerId: 'm', role: 'PLAYER' }, u.token, undefined, asOther)).status).toBe(403);
    expect((await call(notifyRoute, { type: 'test' }, u.token, undefined, asOther)).status).toBe(403);
  });

  it('account e schede di un super admin: protetti da tutti tranne un super admin', async () => {
    const sup = await makeUser('sup', { platformRole: 'SUPER_ADMIN' });
    const ga = await makeUser('ga', { platformRole: 'GLOBAL_ADMIN' });
    const pres = await makeUser('pres', { role: 'admin' });
    const victim = await makeUser('victim', {});
    // l'admin di piattaforma disattiva l'account globale di un utente, non quello di un super admin
    expect((await call(accountDelete, { targetProfileId: 'sup', mode: 'deactivate' }, ga.token)).data.error).toBe('super_admin');
    expect((await call(accountDelete, { targetProfileId: 'victim', mode: 'deactivate' }, pres.token)).status).toBe(403);
    expect((await call(accountDelete, { targetProfileId: 'victim', mode: 'deactivate' }, ga.token)).data.ok).toBe(true);
    expect((await adminAuth().getUser(victim.uid)).disabled).toBe(true);
    // ruolo e uscita dalla lega della scheda di un super admin: no per presidenti e admin di piattaforma
    expect((await call(leagueAdmin, { action: 'role', playerId: 'sup', role: 'COLLABORATOR' }, pres.token)).data.error).toBe('protected');
    expect((await call(leagueAdmin, { action: 'role', playerId: 'sup', role: 'COLLABORATOR' }, ga.token)).data.error).toBe('protected');
    expect((await call(leagueAdmin, { action: 'remove', playerId: 'sup' }, ga.token)).status).toBe(403);
    expect((await call(leagueAdmin, { action: 'role', playerId: 'sup', role: 'COLLABORATOR' }, sup.token)).data.ok).toBe(true);
  });
});

describe('Iscritto che non gioca (organizzatore)', () => {
  it('il presidente lo imposta per un membro: le iscrizioni future vanno via; un giocatore non può farlo', async () => {
    const pres = await makeUser('pres', { role: 'admin' });
    const pl = await makeUser('pl', {});
    const other = await makeUser('other', {});
    const day = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    await ldb().doc(`presences/${day}_pl`).set({ date: day, player_id: 'pl', joined_at: new Date().toISOString() });
    expect((await call(leagueAdmin, { action: 'playing', active: false, playerId: 'pl' }, other.token)).status).toBe(403);
    expect((await call(leagueAdmin, { action: 'playing', active: false, playerId: 'pl' }, pres.token)).data.ok).toBe(true);
    expect((await ldb().doc('players/pl').get()).data()?.isActivePlayer).toBe(false);
    expect((await ldb().doc(`presences/${day}_pl`).get()).exists).toBe(false);
    // il diretto interessato lo riaccende per sé
    expect((await call(leagueAdmin, { action: 'playing', active: true }, pl.token)).data.ok).toBe(true);
    expect((await ldb().doc('players/pl').get()).data()?.isActivePlayer).toBe(true);
  });
});
