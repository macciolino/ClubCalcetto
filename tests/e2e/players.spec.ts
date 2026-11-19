import { expect, test } from '@playwright/test';
import { LEAGUE, PLAYERS, db, loginAsAdmin, seedMatchDay, waitForDoc } from './seed';

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

  test('togliere un giocatore dalla lega: azione distinta da "Disattiva account", l’account resta', async ({ page }) => {
    const p = PLAYERS[1];
    await loginAsAdmin(page);
    await page.goto('/players');
    await page.getByRole('button', { name: new RegExp(`^${p.name}, `) }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Altre azioni' }).click();
    // il super admin vede entrambe, separate: lega e account globale
    await expect(sheet.getByRole('menuitem', { name: 'Togli dalla lega' })).toBeVisible();
    await expect(sheet.getByRole('menuitem', { name: 'Disattiva account' })).toBeVisible();
    await sheet.getByRole('menuitem', { name: 'Togli dalla lega' }).click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(page.getByText(`${p.name} non fa più parte della lega.`)).toBeVisible();

    await waitForDoc(`${LEAGUE}/players/${p.id}`, (d) => Boolean(d?.removed_at));
    expect((await db.doc(`memberships/${p.id}`).get()).data()?.leagues?.calcettari).toBeUndefined();
    expect((await db.doc(`profiles/${p.id}`).get()).data()?.deactivated_at).toBeUndefined();
    await page.reload();
    await expect(page.locator(`text=${PLAYERS[0].name} >> visible=true`).first()).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`^${p.name}, `) })).toHaveCount(0);
  });

  test('ruoli di lega dalla scheda: il presidente nomina, il collaboratore non vede il pulsante', async ({ page }) => {
    const p = PLAYERS[2];
    await loginAsAdmin(page);
    await page.goto('/players');
    await page.getByRole('button', { name: new RegExp(`^${p.name}, `) }).click();
    let sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Altre azioni' }).click();
    await expect(sheet.getByRole('menuitem', { name: 'Nomina presidente' })).toBeVisible();
    await expect(sheet.getByRole('menuitem', { name: /admin/i })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // lo stesso account da collaboratore (e non staff di piattaforma): niente azioni sui ruoli (le fa solo il presidente)
    await db.doc('profiles/p-1').update({ platformRole: 'USER' });
    await db.doc(`${LEAGUE}/players/p-1`).update({ leagueRole: 'COLLABORATOR' });
    await page.reload();
    await page.getByRole('button', { name: new RegExp(`^${p.name}, `) }).click();
    sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Altre azioni' }).click();
    await expect(sheet.getByRole('menuitem', { name: 'Togli dalla lega' })).toBeVisible();
    await expect(sheet.getByRole('menuitem', { name: 'Nomina presidente' })).toHaveCount(0);
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
