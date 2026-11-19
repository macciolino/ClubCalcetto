/**
 * Integration (multi-league 1A): the single-group data is COPIED into the league "I Calcettari".
 * Never overwrites, never deletes, repeatable. Runs on the Firestore and Auth EMULATORS.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as leagueMigration } from '@/app/api/admin/league-migration/route';
import { LEAGUE_COLLECTIONS, migrateToCalcettari } from '@/lib/server/leagueMigration';
import { assertEmulators, call, db, makeUser, profileDoc, resetEmulators } from './helpers';

assertEmulators();

beforeEach(async () => {
  await resetEmulators();
});

const L = 'leagues/calcettari';
const get = async (path: string) => (await db().doc(path).get()).data();

async function seedClub() {
  await db().doc('profiles/p-1').set(profileDoc('p-1', { user_id: 'uid-marco', role: 'admin', locale: 'it', theme: 'dark', matches_won: 9 }));
  await db().doc('profiles/u-admin').set(profileDoc('u-admin', { role: 'admin' }));
  await db().doc('profiles/u-play').set(profileDoc('u-play', { matches_lost: 2, stats: { Tiro: 8 } }));
  await db().doc('profiles/guest-1').set(profileDoc('guest-1', { is_guest: true, user_id: null, email: null }));
  await db().doc('profiles/ex-1').set(profileDoc('ex-1', { user_id: 'u-play', archived_at: '2026-01-01' }));
  await db().doc('matches/2026-01-07').set({ status: 'completed', score_white: 5, score_black: 3, team_white: [{ id: 'p-1', name: 'Marco' }] });
  await db().doc('presences/2026-01-07_u-play').set({ player_id: 'u-play', match_date: '2026-01-07' });
  await db().doc('match_payments/2026-01-07').set({ payments: { 'p-1': true, 'guest-1': false } });
  await db().doc('settings/app_config').set({ standard_total_cost: 80 });
  await db().doc('settings/calendar').set({ open_until: '2026-01-14' });
  await db().doc('sport_fields/f1').set({ name: 'Campo 1', cost: 70 });
}

describe('Migrazione nella lega "I Calcettari"', () => {
  it('prova: conta senza scrivere nulla', async () => {
    await seedClub();
    const dry = await migrateToCalcettari(true);
    expect(dry).toMatchObject({ leagueCreated: true, presidents: 2, players: { source: 5, toCreate: 5 } });
    expect(dry.collections.matches).toEqual({ source: 1, toCreate: 1 });
    expect(dry.collections.settings).toEqual({ source: 2, toCreate: 2 });
    expect(dry.writes).toBeGreaterThan(10);
    expect(await get(L)).toBeUndefined();
    expect(await get('memberships/u-play')).toBeUndefined();
  });

  it('copia tutto con gli stessi id, ruoli e iscrizioni giusti, senza toccare i vecchi dati', async () => {
    await seedClub();
    const before = await Promise.all(['matches/2026-01-07', 'profiles/p-1', 'match_payments/2026-01-07'].map(get));
    const run = await migrateToCalcettari(false);
    expect(run.leagueCreated).toBe(true);

    expect(await get(L)).toMatchObject({ id: 'calcettari', name: 'I Calcettari', slug: 'i-calcettari', status: 'active', visibility: 'private', createdBy: 'p-1' });
    expect(await get(`${L}/matches/2026-01-07`)).toEqual(before[0]);
    expect(await get(`${L}/match_payments/2026-01-07`)).toEqual(before[2]);
    expect(await get(`${L}/presences/2026-01-07_u-play`)).toMatchObject({ player_id: 'u-play' });
    expect(await get(`${L}/settings/app_config`)).toEqual({ standard_total_cost: 80 });
    expect(await get(`${L}/sport_fields/f1`)).toMatchObject({ cost: 70 });

    // schede giocatore: stessi id, dati di lega, niente dati dell'account
    const marco = await get(`${L}/players/p-1`);
    expect(marco).toMatchObject({ id: 'p-1', userId: 'uid-marco', leagueRole: 'PRESIDENT', isActivePlayer: true, matches_won: 9 });
    expect(marco).not.toHaveProperty('email');
    expect(marco).not.toHaveProperty('locale');
    expect(marco).not.toHaveProperty('theme');
    expect(await get(`${L}/players/u-admin`)).toMatchObject({ leagueRole: 'PRESIDENT', userId: 'u-admin' });
    expect(await get(`${L}/players/u-play`)).toMatchObject({ leagueRole: 'PLAYER', matches_lost: 2, stats: { Tiro: 8 } });
    expect(await get(`${L}/players/guest-1`)).toMatchObject({ userId: null, is_guest: true, leagueRole: 'PLAYER' });

    // indice delle iscrizioni: per uid, mai per i record archiviati o gli ospiti
    expect(await get('memberships/uid-marco')).toMatchObject({ leagues: { calcettari: { player_id: 'p-1', league_role: 'PRESIDENT' } } });
    expect(await get('memberships/u-play')).toMatchObject({ leagues: { calcettari: { player_id: 'u-play', league_role: 'PLAYER' } } });
    expect(await get('memberships/guest-1')).toBeUndefined();

    // super admin di piattaforma: solo p-1
    expect((await get('profiles/p-1'))?.platformRole).toBe('SUPER_ADMIN');
    expect((await get('profiles/u-admin'))?.platformRole).toBeUndefined();

    // vecchi dati intatti
    expect(await get('matches/2026-01-07')).toEqual(before[0]);
    expect(await get('match_payments/2026-01-07')).toEqual(before[2]);
    const { platformRole, ...oldMarco } = (await get('profiles/p-1')) || {};
    expect(platformRole).toBe('SUPER_ADMIN');
    expect(oldMarco).toEqual(before[1]);
  });

  it('ripetibile: la seconda volta non scrive nulla e non sovrascrive i dati già nella lega', async () => {
    await seedClub();
    await migrateToCalcettari(false);
    // dopo il passaggio l'app scrive nella lega: una partita cambiata e un ruolo cambiato
    await db().doc(`${L}/matches/2026-01-07`).update({ score_white: 6 });
    await db().doc('memberships/u-play').set({ leagues: { calcettari: { player_id: 'u-play', league_role: 'COLLABORATOR' } } });
    await db().doc('matches/2026-01-14').set({ status: 'scheduled' });

    const again = await migrateToCalcettari(false);
    expect(again.leagueCreated).toBe(false);
    expect(again.writes).toBe(1); // solo la partita nuova
    for (const name of LEAGUE_COLLECTIONS) expect(again.collections[name].toCreate).toBe(name === 'matches' ? 1 : 0);
    expect((await get(`${L}/matches/2026-01-07`))?.score_white).toBe(6);
    expect((await get('memberships/u-play'))?.leagues.calcettari.league_role).toBe('COLLABORATOR');
    expect(await get(`${L}/matches/2026-01-14`)).toEqual({ status: 'scheduled' });

    expect((await migrateToCalcettari(false)).writes).toBe(0);
  });

  it('la route è solo del super admin e di default fa solo la prova', async () => {
    const player = await makeUser('pl');
    expect((await call(leagueMigration, { dryRun: false }, player.token)).status).toBe(403);
    expect((await call(leagueMigration, {})).status).toBe(401);

    const sup = await makeUser('super', { role: 'admin', platformRole: 'SUPER_ADMIN' }, { email: 'macciolino84@gmail.com' });
    // makeUser also joins the test league: start from the single-group data only
    await db().recursiveDelete(db().doc(L));
    const dry = await call(leagueMigration, {}, sup.token);
    expect(dry.data).toMatchObject({ ok: true, dryRun: true, leagueCreated: true });
    expect(await get(L)).toBeUndefined();
    const run = await call(leagueMigration, { dryRun: false }, sup.token);
    expect(run.data).toMatchObject({ ok: true, dryRun: false });
    expect(await get(`${L}/players/pl`)).toMatchObject({ leagueRole: 'PLAYER', userId: 'pl' });
  });
});
