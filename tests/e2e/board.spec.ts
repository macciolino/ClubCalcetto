import { expect, test } from '@playwright/test';
import { PLAYERS, db, loginAs, loginAsAdmin, romeDay, seedAccountWithoutLeague, seedMatchDay } from './seed';

/**
 * "Bacheca Avvisi / Cerco giocatore" (docs/ARCHITECTURE.md §3.5): the president publishes a notice from the
 * league's data, a user with NO league takes the last spot (without joining), the notice leaves the board and the
 * president sees who took it.
 */
test.describe('Bacheca "Cerco giocatore"', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('pubblica → un esterno prende il posto → avviso chiuso, il presidente vede chi è', async ({ page, browser }) => {
    await loginAsAdmin(page);
    await page.goto('/board');
    await expect(page.getByText('La tua lega non ha avvisi.', { exact: false })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Nuovo avviso' }).click();

    // Il modulo parte dai dati della lega: giorno ufficiale, ora standard, campo predefinito e suo prezzo
    const form = page.getByRole('dialog');
    await expect(form.locator('#notice-date')).toHaveValue(romeDay(1), { timeout: 15_000 });
    await expect(form.locator('#notice-time')).toHaveValue('20:30');
    await expect(form.locator('#notice-place')).toHaveValue('Campo Test');
    await expect(form.locator('#notice-address')).toHaveValue('Via dei Test 1');
    await expect(form.locator('#notice-total')).toHaveValue('80');
    await expect(form.locator('#notice-head')).toHaveValue('8');
    await form.locator('#notice-role').selectOption('GOALKEEPER');
    await form.getByRole('button', { name: 'Pubblica' }).click();
    await expect(page.getByText('Avviso pubblicato.')).toBeVisible({ timeout: 15_000 });

    const notices = async () => (await db.collection('match_notices').get()).docs.map((d) => d.data());
    await expect.poll(async () => (await notices()).length, { timeout: 15_000 }).toBe(1);
    const [n] = await notices();
    expect(n).toMatchObject({ leagueId: 'calcettari', matchId: romeDay(1), spotsNeeded: 1, spotsFilled: 0, status: 'OPEN', roleNeeded: 'GOALKEEPER', costPerPlayer: 8 });

    // Un utente senza lega lo trova in bacheca e prende il posto
    const acc = await seedAccountWithoutLeague();
    const other = await (await browser.newContext()).newPage();
    await loginAs(other, acc.email, acc.password);
    // dal benvenuto (nessuna lega) alla bacheca
    await other.getByRole('link', { name: 'Cerca una partita da giocare' }).click();
    await other.waitForURL('**/board');
    const card = other.locator('article').filter({ hasText: 'I Calcettari' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('Portiere', { exact: true })).toBeVisible();
    await expect(card.getByText('1 posto libero')).toBeVisible();
    await expect(card.getByText('8 € a testa')).toBeVisible();
    // badge sulla voce Bacheca: 1 partita cerca giocatori
    await expect(other.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Bacheca/ })).toContainText('1');
    await card.getByRole('button', { name: 'Partecipa alla partita' }).click();
    const join = other.getByRole('dialog');
    await expect(join.getByText('Non entri nella lega', { exact: false })).toBeVisible();
    await join.getByRole('button', { name: 'Conferma partecipazione' }).click();
    await expect(other.getByText('Posto preso: i gestori della lega sono stati avvisati.')).toBeVisible({ timeout: 15_000 });
    // ultimo posto: l'avviso esce dalla bacheca e finisce tra "I miei posti"
    await expect(other.getByText('Nessuna partita cerca giocatori in questo momento.')).toBeVisible({ timeout: 15_000 });
    await expect(other.getByText('Confermato')).toBeVisible();
    expect((await db.doc('memberships/e2e-nolega').get()).exists).toBe(false);

    // Il presidente vede l'avviso chiuso e chi ha preso il posto
    await page.reload();
    await page.getByRole('button', { name: /Campo Test/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Chi ha preso il posto (1/1)')).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Nuovo Arrivato')).toBeVisible();
    // chiuso perché pieno: "Completo"
    await expect(sheet.getByText('Campo Test · Completo')).toBeVisible();
  });

  test('dalla partita: "Cerca giocatori esterni" già compilato, stato nella partita', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings?sezione=partita');
    // il giorno ufficiale (domani), scheda Organizzazione
    await page.getByRole('radio', { name: /Ufficiale/ }).click({ timeout: 15_000 });
    await page.getByRole('tab', { name: /Organizzazione/ }).click();
    await expect(page.getByText('Giocatori esterni', { exact: true })).toBeVisible({ timeout: 15_000 });
    // domani nessun iscritto: mancano tutti e 10
    await expect(page.getByText(/Mancano 10 giocatori/)).toBeVisible();
    await page.getByRole('button', { name: 'Cerca giocatori esterni' }).click();
    const form = page.getByRole('dialog');
    await expect(form.locator('#notice-date')).toHaveValue(romeDay(1));
    await expect(form.locator('#notice-date')).toBeDisabled();
    await expect(form.locator('#notice-time')).toHaveValue('20:30');
    await expect(form.locator('#notice-place')).toHaveValue('Campo Test');
    await expect(form.locator('#notice-spots')).toHaveValue('10');
    await expect(form.locator('#notice-head')).toHaveValue('8');
    await form.locator('#notice-spots').fill('2');
    await form.getByRole('button', { name: 'Pubblica' }).click();
    await expect(page.getByText('Avviso pubblicato.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('In bacheca · 0/2 presi')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Annulla avviso' })).toBeVisible();
  });

  test('profilo: carriera di tutte le leghe con le partite da esterno', async ({ page }) => {
    await db.doc('leagues/calcettari/players/p-1').update({ matches_won: 3, matches_drawn: 1, matches_lost: 2 });
    await db.doc('profiles/p-1/spots/x1').set({
      noticeId: 'x1', leagueId: 'altra', leagueName: 'Lega Amici', matchId: romeDay(-3), dateTime: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      locationName: 'Campo Amici', address: 'Via Amici 1', format: '5v5', costPerPlayer: 8, roleNeeded: 'ANY', shirtColor: 'DARK', status: 'ACTIVE', joinedAt: 'x',
    });
    await loginAsAdmin(page);
    await page.goto('/profile');
    const career = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Carriera' }) });
    await expect(career.getByText('7 partite')).toBeVisible({ timeout: 15_000 });
    await expect(career.getByText('1 da esterno')).toBeVisible();
    // storico personale: la partita da ospite con il suo badge, esito in attesa dell'archiviazione
    await expect(career.getByText('Ospite · Lega Amici')).toBeVisible();
    await expect(career.getByText('In attesa', { exact: true })).toBeVisible();
    await expect(page.getByText('Solo I Calcettari')).toBeVisible();
  });
});

test.describe('Esterno nella partita', () => {
  test('l’esterno è titolare e finisce nelle squadre generate, senza entrare nella rosa', async ({ page }) => {
    await seedMatchDay();
    const day = romeDay(1);
    // 9 giocatori della lega + un esterno (iscrizione scritta dal server quando prende il posto)
    await Promise.all(
      PLAYERS.slice(0, 9).map((p, i) =>
        db.doc(`leagues/calcettari/presences/${day}_${p.id}`).set({ id: `${day}_${p.id}`, date: day, player_id: p.id, status: 'confirmed', order_index: i, created_at: 'x', joined_at: new Date(Date.now() - (30 - i) * 60_000) })
      )
    );
    await db.doc(`leagues/calcettari/presences/${day}_ext-luca`).set({
      id: `${day}_ext-luca`, date: day, player_id: 'ext-luca', status: 'confirmed', order_index: 9, created_at: 'x', joined_at: new Date(),
      external: { profileId: 'luca', userId: 'luca', name: 'Luca Esterno', noticeId: 'n1' },
    });
    await loginAsAdmin(page);
    await page.goto(`/teams?date=${day}`);
    await page.getByRole('button', { name: /Genera squadre/ }).first().click({ timeout: 20_000 });
    await expect.poll(async () => (await db.doc(`leagues/calcettari/generated_teams/${day}`).get()).exists, { timeout: 20_000 }).toBe(true);
    const teams = (await db.doc(`leagues/calcettari/generated_teams/${day}`).get()).data()!;
    const ids = [...teams.team_white, ...teams.team_black].map((p: { id: string }) => p.id);
    expect(ids).toHaveLength(10);
    expect(ids).toContain('ext-luca');
    await expect(page.getByText(/Luca/).first()).toBeVisible({ timeout: 15_000 });
    // nella rosa della lega non c'è
    await page.goto('/players');
    await expect(page.getByText(PLAYERS[0].name).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Luca Esterno')).toHaveCount(0);
  });
});
