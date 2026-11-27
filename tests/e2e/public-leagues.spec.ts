import { expect, test } from '@playwright/test';
import { db, loginAs, loginAsAdmin, seedAccountWithoutLeague, seedMatchDay } from './seed';

/**
 * Public leagues (docs/ARCHITECTURE.md §3.1): the page /leagues with every active public league and a search bar, "Entra"
 * on each one; on the entry screen (no league) the first ones on top with "Vedi tutte"; in the Home of a league member a
 * short card at the end of the side column (last on the phone).
 */
async function publicLeague(id: string, name: string, visibility = 'public') {
  await db.doc(`leagues/${id}`).set({ id, name, slug: id, status: 'active', visibility, createdAt: new Date().toISOString(), createdBy: 'p-1' });
}

test.describe('Leghe pubbliche', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('pagina con ricerca: filtra per nome (anche senza accenti), entra in una lega e la apre', async ({ page }) => {
    await publicLeague('lunedi', 'Lunedì sera');
    await publicLeague('giovedi', 'Giovedì Calcetto Milano');
    await publicLeague('privata', 'Lega riservata', 'private');
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);

    // dall'ingresso: le prime leghe in alto e il link alla pagina completa
    await expect(page.getByRole('heading', { name: 'Leghe pubbliche' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Cerca tra le leghe|Vedi tutte/ }).click();
    // si apre una finestra sopra la pagina (come la scheda di un giocatore), non una pagina nuova
    const win = page.getByRole('dialog');
    await expect(win.getByRole('heading', { name: 'Leghe pubbliche' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/leagues/);
    await expect(win.getByText('2 leghe pubbliche')).toBeVisible({ timeout: 15_000 });
    await expect(win.getByRole('button', { name: /Lega riservata/ })).toHaveCount(0);

    const search = win.getByRole('searchbox', { name: 'Cerca tra le leghe pubbliche' });
    await search.fill('lunedi');
    await expect(win.getByText('1 lega trovata')).toBeVisible();
    await expect(win.getByRole('button', { name: /^Giovedì Calcetto Milano/ })).toHaveCount(0);
    await search.fill('nessuna');
    await expect(win.getByText('Nessuna lega pubblica con «nessuna».')).toBeVisible();
    await win.getByRole('button', { name: 'Cancella la ricerca' }).click();
    await expect(win.getByRole('button', { name: /^Giovedì Calcetto Milano/ })).toBeVisible();

    // entra: conferma, scheda nella lega, si apre la sua Home
    await search.fill('giov');
    await win.getByRole('button', { name: /^Giovedì Calcetto Milano/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: Giovedì Calcetto Milano/ })).toBeVisible({ timeout: 20_000 });
    expect((await db.doc('leagues/giovedi/players/e2e-nolega').get()).data()).toMatchObject({ userId: 'e2e-nolega', stat_status: 'UNCONFIRMED' });
  });

  test('nessuna lega pubblica: il messaggio dice che non ce ne sono in questo momento', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await expect(page.getByText('Non ci sono leghe pubbliche in questo momento.', { exact: false })).toBeVisible({ timeout: 20_000 });
    // il vecchio indirizzo della pagina porta alla schermata di ingresso
    await page.goto('/leagues');
    await expect(page.getByRole('heading', { name: 'Il tuo calcetto, senza chat infinite.', level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('Home di chi è in una lega: card in fondo alla colonna laterale, mai sopra la partita; porta alla pagina', async ({ page }) => {
    await publicLeague('lunedi', 'Lunedì sera');
    await loginAsAdmin(page);
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Leghe pubbliche' }) });
    await expect(card.getByText('1 lega aperta a tutti', { exact: false })).toBeVisible({ timeout: 20_000 });
    // sul telefono è l'ultimo blocco della pagina: sotto la prossima partita e sotto "Il tuo rendimento"
    const next = await page.locator('section[aria-labelledby="next-match"]').boundingBox();
    const form = await page.locator('section[aria-labelledby="my-form"]').boundingBox();
    const mine = await card.boundingBox();
    expect(mine!.y).toBeGreaterThan(next!.y);
    expect(mine!.y).toBeGreaterThan(form!.y);
    await card.getByRole('button', { name: 'Vedi le leghe pubbliche' }).click();
    const win = page.getByRole('dialog');
    await expect(win.getByRole('button', { name: /^Lunedì sera/ })).toBeVisible({ timeout: 15_000 });
    // la Home resta sotto: si chiude e si è ancora lì
    await page.keyboard.press('Escape');
    await expect(win).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby="next-match"]')).toBeVisible();
  });
});
