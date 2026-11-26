/**
 * Integration: onboarding of a NEW account — Radar Base step, joining with an invite / a public league with the values
 * UNCONFIRMED, and the public leagues list (docs/ARCHITECTURE.md, "Registrazione e Radar Base"). Firestore + Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth } from '@/lib/firebase/admin';
import { POST as registered } from '@/app/api/account/registered/route';
import { POST as baseRadar } from '@/app/api/account/base-radar/route';
import { POST as inviteRoute } from '@/app/api/league-invite/route';
import { POST as joinRoute } from '@/app/api/join/route';
import { POST as resolveRequest } from '@/app/api/admin/requests/route';
import { GET as publicList, POST as publicJoin } from '@/app/api/leagues/public/route';
import { resetPublicLeaguesCache } from '@/lib/server/publicLeagues';
import { defaultBaseRadar } from '@/lib/utils/baseRadar';
import { assertEmulators, call, db, idToken, ldb, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

let pres: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulators();
  resetPublicLeaguesCache();
  pres = await makeUser('pres', { role: 'admin', full_name: 'Presidente' });
  await ldb().doc('stat_categories/c1').set({ id: 'c1', name: 'Tiro', default_value: 5 });
  await ldb().doc('stat_categories/c2').set({ id: 'c2', name: 'Difesa', default_value: 7 });
});

/** An account with its global profile but in NO league (like someone who just signed up). */
async function outsider(uid: string, extra: Record<string, unknown> = {}, verified = true) {
  await adminAuth().createUser({ uid, email: `${uid}@example.com`, password: 'password123', emailVerified: verified });
  await db().doc(`profiles/${uid}`).set(profileDoc(uid, { full_name: `Nuovo ${uid}`, stats: { Tiro: 7 }, ...extra }));
  return { uid, token: await idToken(`${uid}@example.com`) };
}

const radar = (over: Record<string, number> = {}) => ({ ...defaultBaseRadar(), ...over });
const code = async () => String((await call(inviteRoute, {}, pres.token)).data.code);

describe('Registrazione: lo step Radar Base', () => {
  it('un account NUOVO ha lo step da fare; senza "isNew" o con il Radar già fatto no', async () => {
    const a = await outsider('na');
    expect((await call(registered, { isNew: true }, a.token)).data).toMatchObject({ ok: true, claimed: false, baseRadarPending: true });
    expect((await db().doc('profiles/na').get()).data()).toMatchObject({ base_radar_pending: true });

    const b = await outsider('nb');
    expect((await call(registered, {}, b.token)).data).toMatchObject({ ok: true, baseRadarPending: false });
    expect((await db().doc('profiles/nb').get()).data()).not.toHaveProperty('base_radar_pending');

    const c = await outsider('nc', { baseRadar: radar() });
    await call(registered, { isNew: true }, c.token);
    expect((await db().doc('profiles/nc').get()).data()).not.toHaveProperty('base_radar_pending');
  });

  it('si salva una sola volta, con 1–10 su ogni parametro; i valori del profilo non cambiano', async () => {
    const u = await outsider('r1', {}, true);
    await call(registered, { isNew: true }, u.token);
    expect((await call(baseRadar, { radar: radar({ Tiro: 11 }) }, u.token)).status).toBe(400);
    expect((await call(baseRadar, { radar: { Tiro: 6 } }, u.token)).status).toBe(400);
    expect((await call(baseRadar, { radar: radar({ Tiro: 6.5 }) }, u.token)).status).toBe(400);
    expect((await call(baseRadar, {}, u.token)).status).toBe(400);
    expect((await db().doc('profiles/r1').get()).data()).toMatchObject({ base_radar_pending: true });

    const ok = await call(baseRadar, { radar: radar({ Tiro: 9, Fisico: 3 }) }, u.token);
    expect(ok.data).toEqual({ ok: true });
    const p = (await db().doc('profiles/r1').get()).data()!;
    expect(p).toMatchObject({ base_radar_pending: false, baseRadar: radar({ Tiro: 9, Fisico: 3 }), stats: { Tiro: 7 } });
    expect(typeof p.baseRadarAt).toBe('string');
    // una seconda volta no: è il punto di partenza, non si riscrive da qui
    expect((await call(baseRadar, { radar: radar() }, u.token)).status).toBe(409);
  });

  it('serve l’accesso; chi non ha lo step in sospeso riceve 409', async () => {
    expect((await call(baseRadar, { radar: radar() })).status).toBe(401);
    const u = await outsider('r2');
    expect((await call(baseRadar, { radar: radar() }, u.token)).status).toBe(409);
  });
});

describe('Entrare con l’invito: i valori del Radar Base, da confermare', () => {
  it('la scheda parte dal Radar Base (solo i parametri che la lega ha), UNCONFIRMED, senza autovalutazione', async () => {
    const c = await code();
    const u = await outsider('j1', { baseRadar: radar({ Tiro: 9, Difesa: 4 }) });
    expect((await call(joinRoute, { code: c }, u.token)).data).toMatchObject({ ok: true, leagueId: 'calcettari' });
    const card = (await ldb().doc('players/j1').get()).data()!;
    expect(card).toMatchObject({ stats: { Tiro: 9, Difesa: 4 }, overall_rating: 6.5, stat_status: 'UNCONFIRMED', needs_stat_review: true, self_stats: radar({ Tiro: 9, Difesa: 4 }) });
    expect(card).not.toHaveProperty('self_rating_pending');
    expect(card).not.toHaveProperty('stats_from');
  });

  it('chi non ha il Radar Base (account vecchio) fa l’autovalutazione di sempre, e il valore resta da confermare', async () => {
    const c = await code();
    const u = await outsider('j2');
    await call(joinRoute, { code: c }, u.token);
    expect((await ldb().doc('players/j2').get()).data()).toMatchObject({ stats: { Tiro: 5, Difesa: 7 }, self_rating_pending: true, stat_status: 'UNCONFIRMED' });
  });

  it('i valori già rivisti in un’altra lega vincono sul Radar Base (e restano da riapprovare)', async () => {
    const c = await code();
    const u = await outsider('j3', { baseRadar: radar({ Tiro: 9, Difesa: 4 }) });
    await db().doc('leagues/altra').set({ id: 'altra', name: 'Altra lega', status: 'active', visibility: 'private' });
    await db().doc('leagues/altra/players/j3').set({ id: 'j3', userId: 'j3', full_name: 'Nuovo j3', stats: { Tiro: 8, Difesa: 8 }, overall_rating: 8, stat_reviewed_at: '2026-01-01' });
    await db().doc('memberships/j3').set({ leagues: { altra: { player_id: 'j3', league_role: 'PLAYER', name: 'Altra lega' } } });
    await call(joinRoute, { code: c }, u.token);
    expect((await ldb().doc('players/j3').get()).data()).toMatchObject({ stats: { Tiro: 8, Difesa: 8 }, stat_status: 'UNCONFIRMED', stats_from: { leagueId: 'altra' } });
  });

  it('"sono io" su un ospite: la scheda nuova parte dal Radar Base; passa all’ospite (e conferma) solo con l’approvazione', async () => {
    await ldb().doc('players/guest-1').set(profileDoc('guest-1', { is_guest: true, user_id: null, userId: null, email: null, full_name: 'Ospite Luca', stats: { Tiro: 9 }, overall_rating: 8, leagueRole: 'PLAYER' }));
    const c = await code();
    const u = await outsider('j4', { baseRadar: radar({ Tiro: 3 }) });
    await call(joinRoute, { code: c, claimPlayerId: 'guest-1' }, u.token);
    expect((await ldb().doc('players/j4').get()).data()).toMatchObject({ stats: { Tiro: 3 }, stat_status: 'UNCONFIRMED' });
    expect((await call(resolveRequest, { id: 'claim_j4', action: 'approve' }, pres.token)).data.ok).toBe(true);
    // i valori li aveva messi un gestore per l'ospite: confermati
    expect((await ldb().doc('players/j4').get()).data()).toMatchObject({ stats: { Tiro: 9 }, stat_status: 'CONFIRMED', needs_stat_review: false });
  });
});

/** A league of its own with `players` cards (the first is its president) and archived matches. */
async function league(id: string, opts: { visibility?: string; status?: string; players?: number; ovr?: number; matches?: { size: number; format?: string }[]; defaultFormat?: string } = {}) {
  const { visibility = 'public', status = 'active', players = 7, ovr = 7, matches = [], defaultFormat } = opts;
  await db().doc(`leagues/${id}`).set({ id, name: `Lega ${id}`, status, visibility, ...(defaultFormat ? { defaultFormat } : {}) });
  for (let i = 0; i < players; i++) {
    // the card id is the profile id (the president's notifications go to `profiles/{id}-pres`)
    const cardId = i === 0 ? `${id}-pres` : `${id}-p${i}`;
    await db().doc(`leagues/${id}/players/${cardId}`).set({ id: cardId, userId: i === 0 ? `${id}-pres` : null, full_name: `Giocatore ${i}`, overall_rating: ovr, leagueRole: i === 0 ? 'PRESIDENT' : 'PLAYER', isActivePlayer: true, is_guest: i !== 0 });
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const team = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `x${k}`, name: `x${k}` }));
    await db().doc(`leagues/${id}/matches/2026-09-${String(i + 1).padStart(2, '0')}`).set({ status: 'completed', team_white: team(m.size / 2), team_black: team(m.size / 2), ...(m.format ? { format: m.format } : {}) });
  }
}

const listFor = async (token: string) => (await call(publicList, undefined, token)).data.leagues as { id: string; name: string; format: string; avgOverall: number | null; players: number; matches: number }[];

describe('Leghe pubbliche (vetrina)', () => {
  it('elenca solo le pubbliche e attive, con formato prevalente, OVR medio, giocatori e partite', async () => {
    await league('pub', { players: 8, ovr: 7, matches: [{ size: 14 }, { size: 14 }, { size: 10 }] });
    await league('priv', { visibility: 'private' });
    await league('sosp', { status: 'suspended' });
    await league('nuova', { players: 3, defaultFormat: '8v8' });
    const u = await outsider('v1');
    const list = await listFor(u.token);
    expect(list.map((l) => l.id).sort()).toEqual(['nuova', 'pub']);
    expect(list.find((l) => l.id === 'pub')).toMatchObject({ name: 'Lega pub', format: '7v7', avgOverall: 7, players: 8, matches: 3 });
    // pochi giocatori: "Nuova lega" (nessuna media), formato di default e nessuna partita
    expect(list.find((l) => l.id === 'nuova')).toMatchObject({ format: '8v8', avgOverall: null, players: 3, matches: 0 });
  });

  it('non mostra le leghe di cui l’account fa già parte, ne conta solo chi gioca davvero', async () => {
    await league('pub', { players: 8 });
    await db().doc('leagues/pub/players/pub-p1').update({ removed_at: 'x' });
    await db().doc('leagues/pub/players/pub-p2').update({ isActivePlayer: false });
    const u = await outsider('v2');
    expect((await listFor(u.token))[0]).toMatchObject({ id: 'pub', players: 6 });
    await db().doc('memberships/v2').set({ leagues: { pub: { player_id: 'v2', league_role: 'PLAYER', name: 'Lega pub' } } });
    resetPublicLeaguesCache();
    expect(await listFor(u.token)).toEqual([]);
  });

  it('serve l’accesso con email verificata', async () => {
    expect((await call(publicList)).status).toBe(401);
    const u = await outsider('v3', {}, false);
    expect((await call(publicList, undefined, u.token)).status).toBe(403);
    expect((await call(publicJoin, { leagueId: 'pub' }, u.token)).status).toBe(403);
  });
});

describe('Unirsi a una lega pubblica', () => {
  it('scheda nuova dal Radar Base, UNCONFIRMED, iscrizione alla lega; i gestori sono avvisati', async () => {
    await league('pub', { players: 7 });
    const u = await outsider('p1', { baseRadar: radar({ Tiro: 9 }) });
    const res = await call(publicJoin, { leagueId: 'pub' }, u.token);
    expect(res.data).toEqual({ ok: true, leagueId: 'pub' });
    const card = (await db().doc('leagues/pub/players/p1').get()).data()!;
    expect(card).toMatchObject({ userId: 'p1', leagueRole: 'PLAYER', isActivePlayer: true, stat_status: 'UNCONFIRMED', needs_stat_review: true });
    expect(card.stats.Tiro).toBe(9);
    expect(card.stats.Fisico).toBe(6);
    expect((await db().doc('memberships/p1').get()).data()?.leagues.pub).toMatchObject({ player_id: 'p1', league_role: 'PLAYER', name: 'Lega pub' });
    const bell = (await db().collection('profiles/pub-pres/notifications').get()).docs.map((d) => d.data());
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ title: '🆕 Nuovo giocatore in lega', url: '/players?player=p1' });
    expect(String(bell[0].body)).toContain('si è unito alla lega · Valori da revisionare');
    // di nuovo: già dentro, nessuna seconda scheda né seconda notifica
    expect((await call(publicJoin, { leagueId: 'pub' }, u.token)).data).toEqual({ ok: true, leagueId: 'pub', already: true });
    expect((await db().collection('profiles/pub-pres/notifications').get()).size).toBe(1);
  });

  it('una lega privata, sospesa o che non esiste non si può "entrare": stessa risposta', async () => {
    await league('priv', { visibility: 'private' });
    await league('sosp', { status: 'suspended' });
    const u = await outsider('p2');
    for (const id of ['priv', 'sosp', 'nonesiste', '../x']) {
      const res = await call(publicJoin, { leagueId: id }, u.token);
      expect([res.status, res.data]).toEqual([404, { ok: false, error: 'not_public' }]);
    }
    expect((await db().doc('memberships/p2').get()).exists).toBe(false);
    expect((await call(publicJoin, { leagueId: 'priv' })).status).toBe(401);
  });
});
