/**
 * Integration: platform roles come ONLY from profiles.platformRole (never from the email), GLOBAL_ADMIN is a
 * read-only platform helper, and the super admin has no shortcut inside leagues it does not manage.
 * Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listLeagues, POST as setStatus } from '@/app/api/super-admin/leagues/route';
import { GET as listStaff, POST as setStaff } from '@/app/api/super-admin/admins/route';
import { POST as emailPrivacy } from '@/app/api/admin/email-privacy/route';
import { POST as inviteRoute } from '@/app/api/league-invite/route';
import { POST as resolveRequest } from '@/app/api/admin/requests/route';
import { GET as leagueEmails } from '@/app/api/league-emails/route';
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
  it('il super admin lo nomina per email esatta e lo toglie; l’admin vede le leghe ma non agisce', async () => {
    const sup = await makeUser('sup', { platformRole: 'SUPER_ADMIN' });
    const helper = await makeUser('helper', {});
    expect((await call(setStaff, { email: 'nessuno@example.com', role: 'GLOBAL_ADMIN' }, sup.token)).status).toBe(404);
    expect((await call(setStaff, { email: 'non-una-email', role: 'GLOBAL_ADMIN' }, sup.token)).status).toBe(400);
    expect((await call(setStaff, { email: 'HELPER@example.com', role: 'GLOBAL_ADMIN' }, sup.token)).data.ok).toBe(true);
    expect((await db().doc('profiles/helper').get()).data()?.platformRole).toBe('GLOBAL_ADMIN');

    // vede la console, non sospende, non nomina, non tocca la privacy
    expect((await call(listLeagues, undefined, helper.token, leaguesUrl)).status).toBe(200);
    expect((await call(setStatus, { leagueId: 'calcettari', status: 'suspended' }, helper.token)).status).toBe(403);
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

describe('Nessuna scorciatoia del super admin nelle leghe', () => {
  it('in una lega dove non è gestore: niente inviti, richieste o email dei membri', async () => {
    const sup = await makeUser('sup', { platformRole: 'SUPER_ADMIN' });
    await db().doc('leagues/other').set({ id: 'other', name: 'Altra', status: 'active', visibility: 'private' });
    await db().doc('leagues/other/admin_requests/x').set({ type: 'new_signup', status: 'open', profile_id: 'zz', name: 'Z' });
    expect((await call(inviteRoute, {}, sup.token, undefined, asOther)).status).toBe(403);
    expect((await call(resolveRequest, { id: 'x', action: 'new' }, sup.token, undefined, asOther)).status).toBe(403);
    expect((await call(leagueEmails, undefined, sup.token, 'http://localhost/api/league-emails', asOther)).status).toBe(403);
    // giocatore semplice nella propria lega: nemmeno lì
    await ldb().doc('players/sup').update({ leagueRole: 'PLAYER' });
    expect((await call(inviteRoute, {}, sup.token)).status).toBe(403);
  });
});
