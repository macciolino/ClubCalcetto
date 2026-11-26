import { expect, test } from '@playwright/test';
import { PLAYERS, auth, db, lg, loginAs, loginAsAdmin, seedMatchDay, waitForDoc } from './seed';

/**
 * Radar of the external players (docs/ARCHITECTURE.md §3.5 and "Registrazione e Radar Base"): after the archive the
 * managers can leave a quick, optional rating of the guest; it goes in the report and in THEIR global radar. The profile
 * shows that global radar apart from the radar each league holds.
 */
const RADAR = { Velocità: 6, Fisico: 6, Resistenza: 6, Tiro: 6, Passaggio: 6, Dribbling: 6, Difesa: 6, Visione: 6 };

test.describe('Valutazione dell’esterno', () => {
  test('il presidente valuta l’ospite a partita archiviata: referto e Radar globale, la scheda dell’altra lega non cambia', async ({ page }) => {
    const { date } = await seedMatchDay();
    const kick = new Date(Date.now() - 20 * 3_600_000).toISOString();
    await lg(`matches/${date}`).set({
      id: date, match_date: date, status: 'completed', score_white: 3, score_black: 1, closed_by: 'p-1',
      team_white: [...PLAYERS.slice(0, 4).map((p) => ({ id: p.id, name: p.name })), { id: 'ext-luca', name: 'Luca Ospite' }],
      team_black: PLAYERS.slice(5).map((p) => ({ id: p.id, name: p.name })),
    });
    await db.doc('match_notices/n1').set({
      id: 'n1', leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: date, dateTime: kick, locationName: 'Campo Test', address: 'Via dei Test 1',
      format: '5v5', totalFieldCost: 80, costPerPlayer: 8, spotsNeeded: 1, spotsFilled: 1, roleNeeded: 'ANY', shirtColor: 'DARK', status: 'CLOSED', closedReason: 'full',
      createdBy: { profileId: 'p-1', name: 'Marco Test' }, created_at: kick, updated_at: kick,
    });
    await db.doc('match_notices/n1/applicants/luca').set({ profileId: 'luca', userId: 'luca', displayName: 'Luca Ospite', joinedAt: kick });
    await db.doc('profiles/luca').set({ id: 'luca', user_id: 'luca', full_name: 'Luca Ospite', role: 'player', is_guest: false, stats: {}, overall_rating: 6, baseRadar: { ...RADAR, Tiro: 4 } });
    await db.doc('profiles/luca/spots/n1').set({ noticeId: 'n1', leagueId: 'calcettari', matchId: date, dateTime: kick, status: 'ACTIVE', joinedAt: kick });
    // membro fisso di un'altra lega, con i suoi valori confermati lì
    await db.doc('leagues/amici').set({ id: 'amici', name: 'Lega Amici', status: 'active' });
    await db.doc('leagues/amici/players/luca').set({ id: 'luca', userId: 'luca', full_name: 'Luca Ospite', stats: { ...RADAR, Tiro: 8 }, overall_rating: 6.3, stat_status: 'CONFIRMED' });

    await loginAsAdmin(page);
    await page.goto('/board');
    await page.getByRole('button', { name: /Campo Test/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Chi ha preso il posto (1/1)')).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Valutazione rapida (facoltativa)')).toBeVisible({ timeout: 15_000 });
    await sheet.getByRole('button', { name: 'Valuta', exact: true }).click();

    const form = page.getByRole('dialog').filter({ hasText: 'Valuta Luca Ospite' });
    await expect(form).toBeVisible();
    await expect(form.getByText('Non cambia i valori che la persona ha nelle sue leghe', { exact: false })).toBeVisible();
    await form.locator('#stat-Tiro').fill('9');
    await form.getByRole('button', { name: 'Salva valutazione' }).click();

    // nel referto della partita e nel Radar globale della persona
    const report = await waitForDoc(`leagues/calcettari/matches/${date}`, (d) => Boolean(d?.external_ratings?.['ext-luca']));
    expect(report!.external_ratings['ext-luca']).toMatchObject({ profileId: 'luca', rated_by: 'p-1', stats: { Tiro: 9, Fisico: 6 } });
    const spot = (await db.doc('profiles/luca/spots/n1').get()).data()!;
    expect(spot.rating).toMatchObject({ stats: { Tiro: 9 } });
    // ... e mai su una scheda di lega, né nell'altra lega né qui, né sul Radar Base
    expect((await db.doc('leagues/amici/players/luca').get()).data()).toMatchObject({ stats: { Tiro: 8 }, stat_status: 'CONFIRMED' });
    expect((await lg('players/luca').get()).exists).toBe(false);
    expect((await db.doc('profiles/luca').get()).data()?.baseRadar).toMatchObject({ Tiro: 4 });

    // l'elenco ora dice che è valutato e permette di correggere
    await expect(page.getByRole('dialog').getByText('Valutato · OVR 64')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('dialog').locator('li').getByRole('button', { name: 'Modifica', exact: true })).toBeVisible();
  });

  test('chi non ha giocato o la partita non archiviata: niente pulsante "Valuta"', async ({ page }) => {
    const { date } = await seedMatchDay();
    const kick = new Date(Date.now() - 20 * 3_600_000).toISOString();
    await db.doc('match_notices/n2').set({
      id: 'n2', leagueId: 'calcettari', leagueName: 'I Calcettari', matchId: date, dateTime: kick, locationName: 'Campo Test', address: 'Via dei Test 1',
      format: '5v5', totalFieldCost: 80, costPerPlayer: 8, spotsNeeded: 1, spotsFilled: 1, roleNeeded: 'ANY', shirtColor: 'DARK', status: 'CLOSED', closedReason: 'full',
      createdBy: { profileId: 'p-1', name: 'Marco Test' }, created_at: kick, updated_at: kick,
    });
    await db.doc('match_notices/n2/applicants/luca').set({ profileId: 'luca', userId: 'luca', displayName: 'Luca Ospite', joinedAt: kick });
    await loginAsAdmin(page);
    await page.goto('/board');
    await page.getByRole('button', { name: /Campo Test/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Chi ha preso il posto (1/1)')).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Invita nella lega')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Valuta', exact: true })).toHaveCount(0);
  });
});

test.describe('Profilo: Radar globale e radar delle leghe', () => {
  test('il Radar Base e le valutazioni da ospite stanno a parte dai valori di ogni lega', async ({ page }) => {
    await seedMatchDay();
    await auth.createUser({ uid: 't1', email: 't1@example.com', password: 'password123', emailVerified: true, displayName: 'Test Uno' });
    await db.doc('memberships/t1').set({ leagues: { calcettari: { player_id: 't1', league_role: 'PLAYER', name: 'I Calcettari' } } });
    await db.doc('profiles/t1').update({ baseRadar: { ...RADAR, Tiro: 10 } });
    await lg('players/t1').update({ stat_status: 'CONFIRMED', stats: { ...RADAR, Tiro: 7 }, overall_rating: 6.1 });
    await db.doc('profiles/t1/spots/x1').set({
      noticeId: 'x1', leagueId: 'amici', leagueName: 'Lega Amici', matchId: '2026-01-10', dateTime: '2026-01-10T19:30:00.000Z', locationName: 'Campo Amici', address: 'x',
      format: '5v5', costPerPlayer: 8, roleNeeded: 'ANY', shirtColor: 'DARK', status: 'ACTIVE', joinedAt: 'x', result: 'won', goals: 0, mvp: false,
      rating: { stats: { ...RADAR, Tiro: 9 }, overall_rating: 6.4, rated_at: 'x' },
    });

    await loginAs(page, 't1@example.com', 'password123');
    await page.goto('/profile');
    const global = page.getByRole('region', { name: 'Radar globale' });
    await expect(global).toBeVisible({ timeout: 20_000 });
    await expect(global.getByRole('heading', { name: 'Radar Base' })).toBeVisible();
    await expect(global.getByText('OVR 65', { exact: true }).first()).toBeVisible(); // Radar Base: (7×6 + 10) / 8 = 6.5
    await expect(global.getByRole('heading', { name: 'Valutazioni da ospite' })).toBeVisible();
    await expect(global.getByText('Media di 1 valutazione', { exact: false })).toBeVisible();
    // radar delle leghe: la lega con il suo valore e lo stato deciso dai SUOI gestori
    await expect(global.getByText('Radar nelle tue leghe')).toBeVisible();
    await expect(global.getByText('I Calcettari')).toBeVisible();
    await expect(global.getByText('Verificato')).toBeVisible();
    await expect(global.getByText('OVR 61', { exact: true })).toBeVisible(); // la scheda locale: (7×1 + 6×7... ) = 6.1
    await expect(global.getByText('Ogni lega ha i suoi valori', { exact: false })).toBeVisible();
    // il radar della lega attiva ha il suo titolo e resta separato
    await expect(page.getByText('Valori nella lega «I Calcettari»')).toBeVisible();
  });
});
