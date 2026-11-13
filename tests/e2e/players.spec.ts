import { expect, test } from '@playwright/test';
import { PLAYERS, db, loginAsAdmin, seedMatchDay } from './seed';

/** Giocatori: page, player detail and compare, in Italian and in English (positions and stats only change on screen). */
test.describe('Giocatori in italiano e in inglese', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('italiano: pagina e scheda giocatore', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/players');
    await expect(page.getByRole('heading', { name: 'Giocatori' })).toBeVisible();
    await expect(page.getByLabel('Filtro ruolo').locator('option')).toContainText(['Tutti', 'Portieri', 'Esterni']);
    await page.getByRole('button', { name: new RegExp(`^${PLAYERS[0].name}, Esterno`) }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('tab', { name: 'Abilità' })).toBeVisible();
    await expect(sheet.getByText('Ultime 5')).toBeVisible();
  });

  test('inglese: filtri, elenco, scheda e confronto tradotti', async ({ page }) => {
    await db.doc('profiles/p-1').update({ locale: 'en' });
    await loginAsAdmin(page);
    await page.goto('/players');
    await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible();
    await expect(page.getByPlaceholder('Search player')).toBeVisible();
    await expect(page.getByLabel('Role filter').locator('option')).toContainText(['All', 'Goalkeepers', 'Wingers']);
    await expect(page.getByLabel('Sort by').locator('option')).toContainText(['By OVR', 'Name A-Z']);

    // scheda giocatore: ruolo, schede e parametri in inglese
    await page.getByRole('button', { name: new RegExp(`^${PLAYERS[0].name}, Winger`) }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('tab', { name: 'Skills' })).toBeVisible();
    await expect(sheet.getByText('Last 5', { exact: true })).toBeVisible();
    await expect(sheet.getByRole('list', { name: 'Ratings' })).toContainText('PAC');
    await sheet.getByRole('tab', { name: 'Stats' }).click();
    // il testo c'è due volte (schede su telefono, colonne su PC): la prima è quella visibile qui
    await expect(sheet.getByText('Stats appear after the first archived match.').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    // elenco compatto
    await page.getByRole('radio', { name: 'List' }).click();
    await expect(page.getByText(/^\d+ players$/)).toBeVisible();
    await expect(page.getByText('W · D · L')).toBeVisible();

    // confronto
    await page.getByRole('button', { name: 'Compare two players' }).click();
    const compare = page.getByRole('dialog', { name: 'Compare players' });
    await expect(compare.getByLabel('First player')).toBeVisible();
    await expect(compare.getByLabel('Second player')).toBeVisible();
    await expect(compare.getByRole('button', { name: 'Close' })).toBeVisible();
  });
});
