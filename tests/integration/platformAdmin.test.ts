/**
 * Integration (multi-league step 4): platform governance. Only `platformRole: 'SUPER_ADMIN'` lists every league and
 * suspends / re-activates it; a suspended league refuses invites, management actions and server writes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as listLeagues, POST as setStatus } from '@/app/api/super-admin/leagues/route';
import { GET as joinInfo } from '@/app/api/join/route';
import { POST as inviteRoute } from '@/app/api/league-invite/route';
import { POST as leagueAdmin } from '@/app/api/league-admin/route';
import { POST as notify } from '@/app/api/notify/route';
import { assertEmulators, call, db, ldb, makeUser, resetEmulators } from './helpers';

assertEmulators();

const listUrl = 'http://localhost/api/super-admin/leagues';

beforeEach(async () => {
  await resetEmulators();
});

describe('Console super admin', () => {
  it('solo platformRole SUPER_ADMIN; elenco con membri, ospiti, stato e data', async () => {
    const sup = await makeUser('boss', { role: 'player' });
    await db().doc('profiles/boss').update({ platformRole: 'SUPER_ADMIN' });
    const pres = await makeUser('pres', { role: 'admin' }); // presidente di lega, NON super admin
    await ldb().doc('players/guest-1').set({ id: 'guest-1', is_guest: true, userId: null });
    await db().doc('leagues/other').set({ id: 'other', name: 'Altra', status: 'active', visibility: 'public', createdAt: '2026-12-01T10:00:00.000Z', createdBy: 'x' });
    await db().doc('leagues/calcettari').update({ createdAt: '2026-11-01T10:00:00.000Z' });

    expect((await call(listLeagues, undefined, pres.token, listUrl)).status).toBe(403);
    expect((await call(listLeagues, undefined, undefined, listUrl)).status).toBe(403);
    const res = await call(listLeagues, undefined, sup.token, listUrl);
    expect(res.status).toBe(200);
    const rows = res.data.leagues as { id: string; members: number; guests: number; status: string }[];
    expect(rows.map((r) => r.id)).toEqual(['other', 'calcettari']); // più recenti prima
    expect(rows[1]).toMatchObject({ members: 2, guests: 1, status: 'active' });
    expect(rows[0]).toMatchObject({ members: 0, guests: 0, visibility: 'public' });
  });

  it('sospende e riattiva; un presidente non può farlo', async () => {
    const sup = await makeUser('boss', {});
    await db().doc('profiles/boss').update({ platformRole: 'SUPER_ADMIN' });
    const pres = await makeUser('pres', { role: 'admin' });
    expect((await call(setStatus, { leagueId: 'calcettari', status: 'suspended' }, pres.token)).status).toBe(403);
    expect((await call(setStatus, { leagueId: 'calcettari', status: 'chiusa' }, sup.token)).status).toBe(400);
    expect((await call(setStatus, { leagueId: 'nessuna', status: 'suspended' }, sup.token)).status).toBe(404);
    expect((await call(setStatus, { leagueId: 'calcettari', status: 'suspended' }, sup.token)).data.ok).toBe(true);
    expect((await db().doc('leagues/calcettari').get()).data()).toMatchObject({ status: 'suspended', status_changed_by: 'boss' });
    expect((await call(setStatus, { leagueId: 'calcettari', status: 'active' }, sup.token)).data.ok).toBe(true);
    expect((await db().doc('leagues/calcettari').get()).data()?.status).toBe('active');
  });
});

describe('Lega sospesa', () => {
  it('niente inviti, niente gestione, niente scritture dal server; riattivata torna tutto', async () => {
    const pres = await makeUser('pres', { role: 'admin' });
    const code = String((await call(inviteRoute, {}, pres.token)).data.code);
    await db().doc('leagues/calcettari').update({ status: 'suspended' });

    expect((await call(joinInfo, undefined, undefined, `http://localhost/api/join?code=${code}`)).status).toBe(404);
    expect((await call(inviteRoute, {}, pres.token)).status).toBe(403);
    expect((await call(leagueAdmin, { action: 'settings', name: 'Nuovo nome' }, pres.token)).status).toBe(423);
    expect((await call(notify, { type: 'admin_devices' }, pres.token)).status).toBe(403);
    expect((await call(notify, { type: 'reconcile', date: new Date().toLocaleDateString('en-CA') }, pres.token)).data).toMatchObject({ skipped: true });
    expect((await db().doc('leagues/calcettari').get()).data()?.name).toBe('I Calcettari');

    await db().doc('leagues/calcettari').update({ status: 'active' });
    expect((await call(inviteRoute, {}, pres.token)).data.code).toBe(code);
    expect((await call(leagueAdmin, { action: 'settings', name: 'Nuovo nome' }, pres.token)).data.ok).toBe(true);
  });
});
