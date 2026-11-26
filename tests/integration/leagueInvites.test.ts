/**
 * Integration (multi-league step 3): invite links, joining (new card or claiming a ghost player), league settings,
 * member roles (never without a president), no automatic league at sign-up. Firestore + Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { adminAuth } from '@/lib/firebase/admin';
import { POST as inviteRoute } from '@/app/api/league-invite/route';
import { GET as joinInfo, POST as joinRoute } from '@/app/api/join/route';
import { POST as leagueAdmin } from '@/app/api/league-admin/route';
import { POST as registered } from '@/app/api/account/registered/route';
import { POST as resolveRequest } from '@/app/api/admin/requests/route';
import { assertEmulators, call, db, idToken, ldb, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

let pres: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulators();
  pres = await makeUser('pres', { role: 'admin', full_name: 'Presidente' });
  await ldb().doc('stat_categories/c1').set({ id: 'c1', name: 'Tiro', default_value: 5 });
  await ldb().doc('stat_categories/c2').set({ id: 'c2', name: 'Difesa', default_value: 7 });
});

/** An account with its global profile but NOT in the league (like someone who just signed up). */
async function outsider(uid: string, extra: Record<string, unknown> = {}) {
  await adminAuth().createUser({ uid, email: `${uid}@example.com`, password: 'password123', emailVerified: true });
  await db().doc(`profiles/${uid}`).set(profileDoc(uid, { full_name: `Nuovo ${uid}`, stats: { Tiro: 9 }, matches_won: 30, ...extra }));
  return { uid, token: await idToken(`${uid}@example.com`) };
}

const code = async () => String((await call(inviteRoute, {}, pres.token)).data.code);
const info = (c: string, token?: string) => call(joinInfo, undefined, token, `http://localhost/api/join?code=${c}`);

describe('Link di invito', () => {
  it('presidenti e collaboratori hanno lo stesso link finché non lo rigenerano; i giocatori no', async () => {
    const c = await code();
    expect(c).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(await code()).toBe(c);
    const player = await makeUser('pl', {});
    expect((await call(inviteRoute, {}, player.token)).status).toBe(403);
    await ldb().doc('players/pl').update({ leagueRole: 'COLLABORATOR' });
    expect((await call(inviteRoute, {}, player.token)).data.code).toBe(c);

    const fresh = String((await call(inviteRoute, { regenerate: true }, pres.token)).data.code);
    expect(fresh).not.toBe(c);
    expect((await info(c)).status).toBe(404); // il vecchio non vale più
    expect((await info(fresh)).data).toEqual({ ok: true, leagueName: 'I Calcettari' }); // senza login: solo il nome
  });

  it('lega sospesa o codice inventato: invito non valido', async () => {
    const c = await code();
    expect((await info('inventato123')).status).toBe(404);
    await db().doc('leagues/calcettari').update({ status: 'suspended' });
    expect((await info(c)).status).toBe(404);
    const u = await outsider('o0');
    expect((await call(joinRoute, { code: c }, u.token)).status).toBe(404);
  });
});

describe('Entrare con il link', () => {
  it('nuovo giocatore: scheda con i parametri di base della lega, autovalutazione, iscrizione', async () => {
    const c = await code();
    const u = await outsider('o1');
    const before = await info(c, u.token);
    expect(before.data).toMatchObject({ ok: true, leagueName: 'I Calcettari', member: false });

    const res = await call(joinRoute, { code: c }, u.token);
    expect(res.data).toMatchObject({ ok: true, leagueId: 'calcettari' });
    const card = (await ldb().doc('players/o1').get()).data();
    // i dati di lega partono da zero (non quelli del profilo globale)
    expect(card).toMatchObject({ userId: 'o1', leagueRole: 'PLAYER', isActivePlayer: true, full_name: 'Nuovo o1', stats: { Tiro: 5, Difesa: 7 }, overall_rating: 6, matches_won: 0, self_rating_pending: true, needs_stat_review: true });
    expect(card).not.toHaveProperty('email');
    expect((await db().doc('memberships/o1').get()).data()?.leagues.calcettari).toMatchObject({ player_id: 'o1', league_role: 'PLAYER', name: 'I Calcettari' });

    // i gestori ricevono un avviso che apre la scheda del nuovo giocatore ("Valori da revisionare")
    const alerts = (await db().collection('profiles/pres/notifications').get()).docs.map((d) => d.data());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ title: '🆕 Nuovo giocatore in lega', url: '/players?player=o1' });
    expect(String(alerts[0].body)).toBe('Nuovo o1 si è unito alla lega · Valori da revisionare');
    expect((await db().collection('profiles/o1/notifications').get()).size).toBe(0); // non avvisa chi entra

    // di nuovo: già membro, niente cambia (e nessun secondo avviso)
    expect((await info(c, u.token)).data).toMatchObject({ member: true });
    expect((await call(joinRoute, { code: c }, u.token)).data).toMatchObject({ ok: true, already: true });
    expect((await db().collection('profiles/pres/notifications').get()).size).toBe(1);
  });

  it('"sono io": la scheda dell’ospite passa SOLO dopo l’approvazione di un gestore', async () => {
    await ldb().doc('players/guest-1').set(profileDoc('guest-1', { is_guest: true, user_id: null, userId: null, email: null, full_name: 'Ospite Luca', stats: { Tiro: 9 }, overall_rating: 8, matches_won: 3, leagueRole: 'PLAYER' }));
    await ldb().doc('players/guest-2').set(profileDoc('guest-2', { is_guest: true, user_id: null, userId: null, full_name: 'Ospite archiviato', archived_at: 'x' }));
    await ldb().doc('matches/2026-10-01').set({ status: 'completed', team_white: [{ id: 'guest-1', name: 'Ospite Luca' }], team_black: [], scorers: [{ player_id: 'guest-1', goals: 2 }], mvp_player_id: 'guest-1' });
    const c = await code();
    const u = await outsider('o2');

    const ghosts = (await info(c, u.token)).data.ghosts as { id: string; name: string }[];
    expect(ghosts.map((g) => g.id)).toEqual(['guest-1']); // né account né archiviati

    expect((await call(joinRoute, { code: c, claimPlayerId: 'pres' }, u.token)).status).toBe(400); // non è un ospite
    const res = await call(joinRoute, { code: c, claimPlayerId: 'guest-1' }, u.token);
    expect(res.data).toMatchObject({ ok: true, claimPending: 'Ospite Luca' });
    // nessun avviso "Nuovo giocatore": ai gestori arriva la richiesta, che racconta già tutta la storia
    const titles = (await db().collection('profiles/pres/notifications').get()).docs.map((d) => String(d.data().title));
    expect(titles.some((x) => x.includes('Nuovo giocatore in lega'))).toBe(false);
    // entrato come giocatore nuovo; l'ospite e il suo storico NON sono ancora suoi
    expect((await ldb().doc('players/guest-1').get()).exists).toBe(true);
    expect((await ldb().doc('players/o2').get()).data()).toMatchObject({ matches_won: 0, is_guest: false });
    expect((await ldb().doc('admin_requests/claim_o2').get()).data()).toMatchObject({ type: 'guest_claim', status: 'open', guest_id: 'guest-1', guest_name: 'Ospite Luca' });
    // un giocatore non può approvarla, il presidente sì
    expect((await call(resolveRequest, { id: 'claim_o2', action: 'approve' }, u.token)).status).toBe(403);
    expect((await call(resolveRequest, { id: 'claim_o2', action: 'approve' }, pres.token)).data).toMatchObject({ ok: true, guestName: 'Ospite Luca' });
    expect((await ldb().doc('players/guest-1').get()).exists).toBe(false);
    expect((await ldb().doc('players/o2').get()).data()).toMatchObject({ userId: 'o2', stats: { Tiro: 9 }, overall_rating: 8, matches_won: 3, needs_stat_review: false, self_rating_pending: false });
    const m = (await ldb().doc('matches/2026-10-01').get()).data()!;
    expect([m.team_white[0].id, m.scorers[0].player_id, m.mvp_player_id]).toEqual(['o2', 'o2', 'o2']);
  });

  it('rifiutata: resta un giocatore nuovo; due persone per lo stesso ospite: passa a uno solo', async () => {
    await ldb().doc('players/guest-1').set(profileDoc('guest-1', { is_guest: true, user_id: null, userId: null, email: null, full_name: 'Ospite Luca', matches_won: 3, leagueRole: 'PLAYER' }));
    const c = await code();
    const a = await outsider('oa');
    const b = await outsider('ob');
    await call(joinRoute, { code: c, claimPlayerId: 'guest-1' }, a.token);
    await call(joinRoute, { code: c, claimPlayerId: 'guest-1' }, b.token);
    expect((await call(resolveRequest, { id: 'claim_oa', action: 'reject' }, pres.token)).data.ok).toBe(true);
    expect((await ldb().doc('players/oa').get()).data()?.matches_won).toBe(0);
    expect((await ldb().doc('players/guest-1').get()).exists).toBe(true);
    expect((await call(resolveRequest, { id: 'claim_ob', action: 'approve' }, pres.token)).data.ok).toBe(true);
    expect((await ldb().doc('players/ob').get()).data()?.matches_won).toBe(3);
  });

  it('serve l’accesso con email verificata', async () => {
    const c = await code();
    expect((await call(joinRoute, { code: c })).status).toBe(401);
    await adminAuth().createUser({ uid: 'nv', email: 'nv@example.com', password: 'password123', emailVerified: false });
    await db().doc('profiles/nv').set(profileDoc('nv'));
    expect((await call(joinRoute, { code: c }, await idToken('nv@example.com'))).status).toBe(403);
  });

  it('registrazione senza invito: nessuna lega automatica', async () => {
    const u = await outsider('o3');
    expect((await call(registered, {}, u.token)).data).toMatchObject({ ok: true, claimed: false });
    expect((await db().doc('memberships/o3').get()).exists).toBe(false);
    expect((await ldb().doc('players/o3').get()).exists).toBe(false);
  });
});

describe('Dati della lega e ruoli', () => {
  it('il presidente cambia nome e visibilità; il nome arriva nell’elenco leghe di ogni membro', async () => {
    const pl = await makeUser('pl2', {});
    expect((await call(leagueAdmin, { action: 'settings', name: 'I Calcettari del lunedì', visibility: 'public' }, pres.token)).data.ok).toBe(true);
    expect((await db().doc('leagues/calcettari').get()).data()).toMatchObject({ name: 'I Calcettari del lunedì', slug: 'i-calcettari-del-lunedi', visibility: 'public' });
    expect((await db().doc('memberships/pl2').get()).data()?.leagues.calcettari.name).toBe('I Calcettari del lunedì');
    expect((await call(leagueAdmin, { action: 'settings', name: 'x' }, pres.token)).status).toBe(400);
    expect((await call(leagueAdmin, { action: 'settings', name: 'Mia' }, pl.token)).status).toBe(403);
  });

  it('ruoli: promuove e declassa, mai senza presidente, mai un ospite manager', async () => {
    const pl = await makeUser('pl3', {});
    await ldb().doc('players/guest-9').set({ id: 'guest-9', is_guest: true, userId: null, leagueRole: 'PLAYER' });
    const role = (playerId: string, r: string, token = pres.token) => call(leagueAdmin, { action: 'role', playerId, role: r }, token);

    expect((await role('pres', 'PLAYER')).data.error).toBe('last_president');
    expect((await role('pl3', 'COLLABORATOR')).data.ok).toBe(true);
    expect((await ldb().doc('players/pl3').get()).data()).toMatchObject({ leagueRole: 'COLLABORATOR', role: 'admin' });
    expect((await db().doc('memberships/pl3').get()).data()?.leagues.calcettari.league_role).toBe('COLLABORATOR');
    expect((await role('pres', 'PLAYER', pl.token)).status).toBe(403); // il collaboratore non cambia ruoli
    expect((await role('guest-9', 'PRESIDENT')).data.error).toBe('guest');
    expect((await role('pl3', 'BOSS')).status).toBe(400);

    // con due presidenti uno può lasciare
    expect((await role('pl3', 'PRESIDENT')).data.ok).toBe(true);
    expect((await role('pres', 'PLAYER')).data.ok).toBe(true);
    expect((await ldb().doc('players/pres').get()).data()?.leagueRole).toBe('PLAYER');
    expect((await role('pl3', 'PLAYER', pl.token)).data.error).toBe('last_president');
  });

  it('la scheda del super admin la cambia solo lui', async () => {
    await ldb().doc('players/p-1').set({ id: 'p-1', userId: 'marco', leagueRole: 'PRESIDENT', is_guest: false });
    expect((await call(leagueAdmin, { action: 'role', playerId: 'p-1', role: 'PLAYER' }, pres.token)).data.error).toBe('protected');
  });

  it('"gioco anch’io": ognuno sulla propria scheda', async () => {
    const pl = await makeUser('pl4', {});
    expect((await call(leagueAdmin, { action: 'playing', active: false }, pl.token)).data.ok).toBe(true);
    expect((await ldb().doc('players/pl4').get()).data()?.isActivePlayer).toBe(false);
    const stranger = await outsider('o4');
    expect((await call(leagueAdmin, { action: 'playing', active: false }, stranger.token)).status).toBe(403);
  });
});
