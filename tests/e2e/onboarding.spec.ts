import { expect, test } from '@playwright/test';
import { db, loginAs, loginAsAdmin, seedAccountWithoutLeague, seedMatchDay } from './seed';

/**
 * Onboarding of a new account (docs/ARCHITECTURE.md, "Registrazione e Radar Base"): first the Radar Base (every value at
 * 6), then the fork — with an invite link straight into that league, without one the public leagues — and the values
 * on the league card stay "Da revisionare" until a president / collaborator approves them.
 */
async function publicLeague(id: string, name: string, opts: { players: number; matchSize?: number[]; visibility?: string }) {
  await db.doc(`leagues/${id}`).set({ id, name, slug: id, status: 'active', visibility: opts.visibility || 'public', createdAt: new Date().toISOString(), createdBy: 'p-1' });
  for (let i = 0; i < opts.players; i++) {
    await db.doc(`leagues/${id}/players/${id}-${i}`).set({ id: `${id}-${i}`, userId: null, full_name: `Giocatore ${id} ${i}`, position: 'Esterno', overall_rating: 7, leagueRole: i === 0 ? 'PRESIDENT' : 'PLAYER', isActivePlayer: true, is_guest: true, stats: {}, matches_won: 0, matches_drawn: 0, matches_lost: 0 });
  }
  for (const [i, size] of (opts.matchSize || []).entries()) {
    const team = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `x${k}`, name: `x${k}` }));
    await db.doc(`leagues/${id}/matches/2026-09-0${i + 1}`).set({ id: `2026-09-0${i + 1}`, match_date: `2026-09-0${i + 1}`, status: 'completed', team_white: team(size / 2), team_black: team(size / 2), score_white: 1, score_black: 0 });
  }
}

async function newAccount() {
  const acc = await seedAccountWithoutLeague();
  await db.doc('profiles/e2e-nolega').update({ base_radar_pending: true });
  return acc;
}

test.describe('Nuovo account: Radar Base e leghe pubbliche', () => {
  test.beforeEach(async () => {
    await seedMatchDay(); // I Calcettari: privata
    await publicLeague('pubblica', 'Lunedì sera', { players: 8, matchSize: [14, 14] });
    await publicLeague('nuova', 'Lega appena nata', { players: 3 });
    await publicLeague('privata', 'Lega riservata', { players: 8, visibility: 'private' });
  });

  test('prima il Radar Base (tutto a 6, con l’avviso "da confermare"), poi le leghe pubbliche; nulla passa prima', async ({ page }) => {
    const acc = await newAccount();
    await loginAs(page, acc.email, acc.password);
    await expect(page.getByRole('heading', { name: 'Il tuo Radar Base' })).toBeVisible({ timeout: 20_000 });
    // otto abilità, tutte a 6; l'avviso dice che i valori non sono confermati
    const sliders = page.locator('input[type="range"]');
    await expect(sliders).toHaveCount(8);
    for (const v of await sliders.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))) expect(v).toBe('6');
    await expect(page.getByText('Valori da confermare', { exact: true })).toBeVisible();
    await expect(page.getByText('un presidente o un collaboratore li approva o li modifica dopo la tua prima partita', { exact: false })).toBeVisible();
    // la Bacheca non si apre prima di aver finito
    await page.goto('/board');
    await expect(page.getByRole('heading', { name: 'Il tuo Radar Base' })).toBeVisible({ timeout: 15_000 });

    await page.locator('#stat-Tiro').fill('9');
    await page.getByRole('button', { name: 'Salva e prosegui' }).click();
    await expect(page.getByRole('heading', { name: 'Il tuo Radar Base' })).toHaveCount(0, { timeout: 15_000 });
    const profile = (await db.doc('profiles/e2e-nolega').get()).data()!;
    expect(profile.base_radar_pending).toBe(false);
    expect(profile.baseRadar).toMatchObject({ Tiro: 9, Fisico: 6, Velocità: 6 });

    // la Bacheca ora è raggiungibile
    await page.goto('/board');
    await expect(page.getByRole('heading', { name: 'Cerco giocatore', level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('senza invito: card delle leghe pubbliche (formato, OVR medio o "Nuova lega", partite); entrare = scheda da confermare', async ({ page }) => {
    const acc = await newAccount();
    await loginAs(page, acc.email, acc.password);
    await page.getByRole('button', { name: 'Salva e prosegui' }).click({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Il tuo calcetto, senza chat infinite.' })).toBeVisible({ timeout: 15_000 });

    const pubblica = page.getByRole('button', { name: /^Lunedì sera/ });
    await expect(pubblica).toBeVisible({ timeout: 15_000 });
    await expect(pubblica).toContainText('7vs7');
    await expect(pubblica).toContainText('OVR medio 70');
    await expect(pubblica).toContainText('2 partite giocate');
    await expect(pubblica).toContainText('8 giocatori');
    const nuova = page.getByRole('button', { name: /^Lega appena nata/ });
    await expect(nuova).toContainText('Nuova lega');
    await expect(nuova).toContainText('0 partite giocate');
    // le private non compaiono; restano creare una lega e la Bacheca
    await expect(page.getByRole('button', { name: /Lega riservata/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Crea una lega' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cerca una partita da giocare' })).toBeVisible();

    // entra: la scheda parte dal Radar Base ed è "Da revisionare"
    await pubblica.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: Lunedì sera/ })).toBeVisible({ timeout: 20_000 });
    const card = (await db.doc('leagues/pubblica/players/e2e-nolega').get()).data()!;
    expect(card).toMatchObject({ userId: 'e2e-nolega', stat_status: 'UNCONFIRMED', needs_stat_review: true });
    expect((await db.doc('memberships/e2e-nolega').get()).data()?.leagues?.pubblica).toBeTruthy();
    await page.goto('/players');
    const mine = page.getByRole('button', { name: /^Nuovo Arrivato, .*OVR/ });
    await expect(mine).toBeVisible({ timeout: 15_000 });
    await expect(mine).toContainText('Da revisionare');

    // conferma di un gestore: l'etichetta sparisce
    await db.doc('leagues/pubblica/players/e2e-nolega').update({ stat_status: 'CONFIRMED' });
    await page.reload();
    await expect(page.getByRole('button', { name: /^Nuovo Arrivato, .*OVR/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Da revisionare')).toHaveCount(0);
  });

  test('con un invito: dopo il Radar Base si arriva all’ingresso della lega e la scheda parte dal Radar, da confermare', async ({ page }) => {
    const acc = await newAccount();
    await db.doc('league_invites/INVITOPROVA12').set({ code: 'INVITOPROVA12', leagueId: 'calcettari', createdBy: 'p-1', createdAt: new Date().toISOString(), revoked: false });
    await page.addInitScript(() => localStorage.setItem('cc_return_to', '/join/INVITOPROVA12'));
    // dal login si va all'invito (non alla Home): si entra con il form, senza aspettare la Home
    await page.goto('/login');
    await page.locator('#auth-email').fill(acc.email);
    await page.locator('#auth-password').fill(acc.password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Il tuo Radar Base' })).toBeVisible({ timeout: 30_000 });
    await page.locator('#stat-Difesa').fill('3');
    await page.getByRole('button', { name: 'Salva e prosegui' }).click();
    // dopo il Radar si prosegue dall'invito
    await expect(page.getByText('I Calcettari')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Entra nella lega' }).click();
    await expect.poll(async () => (await db.doc('leagues/calcettari/players/e2e-nolega').get()).exists, { timeout: 20_000 }).toBe(true);
    const card = (await db.doc('leagues/calcettari/players/e2e-nolega').get()).data()!;
    expect(card).toMatchObject({ stat_status: 'UNCONFIRMED', needs_stat_review: true });
    expect(card.stats).toMatchObject({ Difesa: 3, Tiro: 6 });
    expect(card).not.toHaveProperty('self_rating_pending');
  });

  test('chi ha già una lega (account esistente) non vede lo step e le vecchie schede non cambiano', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: 'Il tuo Radar Base' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ciao Marco', level: 1 })).toBeVisible({ timeout: 15_000 });
    // nessuna etichetta "Da revisionare" sulle schede di una lega che esisteva già
    await page.goto('/players');
    await expect(page.getByText('Test Uno').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Da revisionare')).toHaveCount(0);
  });
});
