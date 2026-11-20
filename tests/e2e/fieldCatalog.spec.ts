import { expect, test } from '@playwright/test';
import { db, loginAsAdmin, seedMatchDay } from './seed';

/**
 * Global fields catalog (docs/ARCHITECTURE.md §3.3): a league proposes a pitch (usable at once), the platform
 * staff approve it from the console, another league finds it in the catalog and adds it, linked.
 */
test.describe('Catalogo globale dei campi', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
    await db.doc('leagues/giovedi').set({ id: 'giovedi', name: 'Lega del giovedì', slug: 'lega-del-giovedi', status: 'active', visibility: 'private', createdAt: new Date().toISOString(), createdBy: 'p-1' });
    await db.doc('leagues/giovedi/players/p-1').set({ id: 'p-1', userId: 'e2e-super', user_id: 'e2e-super', full_name: 'Marco Test', leagueRole: 'PRESIDENT', role: 'admin', isActivePlayer: true, is_guest: false, stats: {}, overall_rating: 6 });
    await db.doc('memberships/e2e-super').set({ leagues: { giovedi: { player_id: 'p-1', league_role: 'PRESIDENT', name: 'Lega del giovedì' } } }, { merge: true });
    const old = await db.collection('field_catalog').get();
    await Promise.all(old.docs.map((d) => d.ref.delete()));
  });

  test('proposta → approvazione dalla console → un’altra lega lo aggiunge dal catalogo', async ({ page }) => {
    await loginAsAdmin(page);

    // I Calcettari propone un campo nuovo: si usa subito, segnato "in attesa"
    await page.goto('/settings?sezione=campi');
    await page.getByRole('button', { name: 'Campo', exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Il catalogo è ancora vuoto: proponi il primo campo.')).toBeVisible({ timeout: 15_000 });
    await sheet.getByRole('button', { name: 'Proponi un nuovo campo' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByText('Proponi un campo al catalogo')).toBeVisible();
    await form.getByPlaceholder('Es. Centro Sportivo Green Club').fill('Centro Sportivo Luini');
    await form.getByPlaceholder('Es. Via dello Sport 12, Milano').fill('Via Luini 5, Milano');
    await form.locator('#field-cost').fill('80');
    await form.getByRole('button', { name: 'Salva campo' }).click();
    await expect(page.getByText(/"Centro Sportivo Luini" proposto al catalogo/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('In attesa di approvazione')).toBeVisible({ timeout: 15_000 });

    // lo staff (qui il super admin) lo approva dalla console
    await page.goto('/super-admin');
    await expect(page.getByText('1 proposta da gestire')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Proposto da I Calcettari · 5vs5 €80')).toBeVisible();
    await page.getByRole('button', { name: 'Approva', exact: true }).click();
    await expect(page.getByText(/"Centro Sportivo Luini" approvato/)).toBeVisible({ timeout: 15_000 });

    // nella lega che l'ha proposto ora è "Dal catalogo"
    await page.goto('/settings?sezione=campi');
    await expect(page.getByText('Dal catalogo')).toBeVisible({ timeout: 15_000 });

    // la Lega del giovedì lo trova nel catalogo e lo aggiunge
    await page.getByRole('button', { name: /Lega attiva:/ }).click();
    await page.getByRole('menuitemradio', { name: /Lega del giovedì/ }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ })).toBeVisible();
    await page.goto('/settings?sezione=campi');
    await page.getByRole('button', { name: 'Campo', exact: true }).click();
    await page.getByRole('dialog').getByPlaceholder('Nome del centro o via, città').fill('luini milano');
    await page.getByRole('button', { name: 'Aggiungi Centro Sportivo Luini alla lega' }).click();
    await expect(page.getByText('"Centro Sportivo Luini" aggiunto ai campi della lega.')).toBeVisible({ timeout: 15_000 });
    const leagueFields = async () => (await db.collection('leagues/giovedi/sport_fields').get()).docs.map((d) => d.data());
    await expect.poll(async () => (await leagueFields()).length, { timeout: 15_000 }).toBe(1);
    expect(await leagueFields()).toEqual([expect.objectContaining({ name: 'Centro Sportivo Luini', cost: 80, catalog_status: 'approved', price_override: false })]);

    // il campo collegato si apre con nome e indirizzo in sola lettura
    await page.getByRole('button', { name: 'Modifica Centro Sportivo Luini' }).click();
    const edit = page.getByRole('dialog');
    await expect(edit.getByPlaceholder('Es. Centro Sportivo Green Club')).toBeDisabled();
    await expect(edit.locator('#field-cost')).toBeEnabled();
  });
});
