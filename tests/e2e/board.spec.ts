import { expect, test } from '@playwright/test';
import { db, loginAs, loginAsAdmin, romeDay, seedAccountWithoutLeague, seedMatchDay } from './seed';

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
    await expect(other.getByText('I Calcettari')).toBeVisible({ timeout: 15_000 });
    await expect(other.getByText('Portiere', { exact: true })).toBeVisible();
    await expect(other.getByText('Manca 1 posto')).toBeVisible();
    await other.getByRole('button', { name: 'Prendi il posto' }).click();
    await other.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(other.getByText('Posto preso: i gestori della lega sono stati avvisati.')).toBeVisible({ timeout: 15_000 });
    // ultimo posto: l'avviso esce dalla bacheca
    await expect(other.getByText('Nessuna partita cerca giocatori in questo momento.')).toBeVisible({ timeout: 15_000 });
    expect((await db.doc('memberships/e2e-nolega').get()).exists).toBe(false);

    // Il presidente vede l'avviso chiuso e chi ha preso il posto
    await page.reload();
    await page.getByRole('button', { name: /Campo Test/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Chi ha preso il posto (1/1)')).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByText('Nuovo Arrivato')).toBeVisible();
    await expect(sheet.getByText(/Chiuso/)).toBeVisible();
  });
});
