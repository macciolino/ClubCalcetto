/**
 * Integration: "Esci dalla lega" (the member leaves at once, managers are told, never the last president) and the
 * parameters that follow the account to another league, where a president approves them again.
 * Real route handlers on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as leagueAdmin } from '@/app/api/league-admin/route';
import { POST as inviteRoute } from '@/app/api/league-invite/route';
import { POST as joinRoute } from '@/app/api/join/route';
import { assertEmulators, call, db, futureDate, ldb, makeUser, resetEmulators } from './helpers';

assertEmulators();

const B = 'giovedi';
const asB = { 'x-league-id': B };
let pres: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulators();
  pres = await makeUser('pres', { role: 'admin', full_name: 'Presidente' });
});

const bell = async (uid: string) => (await db().collection(`profiles/${uid}/notifications`).get()).docs.map((d) => `${d.data().title} ${d.data().body}`);

describe('Esci dalla lega', () => {
  it('esce subito: niente accesso, iscrizioni future tolte, scheda e storico restano, i gestori lo sanno', async () => {
    const mario = await makeUser('mario', { full_name: 'Mario Rossi', matches_won: 3 });
    const day = futureDate(4);
    await ldb().doc(`presences/${day}_mario`).set({ id: `${day}_mario`, date: day, player_id: 'mario' });
    expect((await call(leagueAdmin, { action: 'leave' }, mario.token)).data.ok).toBe(true);

    expect((await db().doc('memberships/mario').get()).data()?.leagues?.calcettari).toBeUndefined();
    expect((await ldb().doc(`presences/${day}_mario`).get()).exists).toBe(false);
    const card = (await ldb().doc('players/mario').get()).data()!;
    expect(card.removed_at).toBeTruthy();
    expect(card.matches_won).toBe(3);
    expect((await db().doc('profiles/mario').get()).exists).toBe(true); // l'account resta
    expect((await bell('pres')).some((t) => t.includes('Mario Rossi ha lasciato la lega'))).toBe(true);
    // non è più nella lega: un secondo tentativo non trova la sua scheda
    expect((await call(leagueAdmin, { action: 'leave' }, mario.token)).status).toBe(404);
  });

  it('l’ultimo presidente non esce finché non nomina un altro presidente', async () => {
    await makeUser('other', {});
    expect((await call(leagueAdmin, { action: 'leave' }, pres.token)).data.error).toBe('last_president');
    expect((await call(leagueAdmin, { action: 'role', playerId: 'other', role: 'PRESIDENT' }, pres.token)).data.ok).toBe(true);
    expect((await call(leagueAdmin, { action: 'leave' }, pres.token)).data.ok).toBe(true);
    expect((await db().doc('memberships/pres').get()).data()?.leagues?.calcettari).toBeUndefined();
  });

  it('entra in un’altra lega: porta i suoi parametri, niente autovalutazione, da riapprovare', async () => {
    const mario = await makeUser('mario', { full_name: 'Mario Rossi', position: 'Punta' });
    await ldb().doc('players/mario').update({ stats: { Velocità: 9, Tiro: 8, Difesa: 4 }, stat_reviewed_at: '2026-10-01T10:00:00.000Z', position: 'Punta' });
    await call(leagueAdmin, { action: 'leave' }, mario.token);

    // la Lega del giovedì e il suo presidente
    await db().doc(`leagues/${B}`).set({ id: B, name: 'Lega del giovedì', status: 'active', visibility: 'private' });
    await db().doc(`leagues/${B}/players/pres`).set({ id: 'pres', userId: 'pres', full_name: 'Presidente', leagueRole: 'PRESIDENT', is_guest: false });
    await db().doc('memberships/pres').set({ leagues: { [B]: { player_id: 'pres', league_role: 'PRESIDENT', name: 'Lega del giovedì' } } }, { merge: true });
    const codeB = String((await call(inviteRoute, {}, pres.token, undefined, asB)).data.code);

    expect((await call(joinRoute, { code: codeB }, mario.token)).data.ok).toBe(true);
    const card = (await db().doc(`leagues/${B}/players/mario`).get()).data()!;
    expect(card.stats).toMatchObject({ Velocità: 9, Tiro: 8, Difesa: 4 });
    expect(card).toMatchObject({ needs_stat_review: true, position: 'Punta', stats_from: { leagueId: 'calcettari', leagueName: 'I Calcettari' }, matches_won: 0 });
    expect(card.self_rating_pending).toBeUndefined();
  });
});
