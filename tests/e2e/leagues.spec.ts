import { expect, test } from '@playwright/test';
import { db, loginAs, loginAsAdmin, seedAccountWithoutLeague, seedMatchDay } from './seed';

/** Multi-league step 2: league switcher in the header, creating a league, welcome screen without leagues. */
test.describe('Leghe', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('selettore: lega attiva con il ruolo, elenco delle leghe e "Crea nuova lega"', async ({ page }) => {
    await loginAsAdmin(page);
    const switcher = page.getByRole('button', { name: /Lega attiva: I Calcettari/ });
    await expect(switcher).toBeVisible();
    await expect(switcher).toContainText('Presidente');
    await switcher.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('menuitemradio', { name: /I Calcettari/ })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('menuitem', { name: 'Crea nuova lega' })).toBeVisible();
  });

  test('crea una lega, ci entra da presidente con i suoi dati separati, poi torna ai Calcettari', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: /Lega attiva: I Calcettari/ }).click();
    await page.getByRole('menuitem', { name: 'Crea nuova lega' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByRole('button', { name: 'Crea la lega' })).toBeDisabled();
    await form.getByLabel('Nome della lega').fill('Lega del giovedì');
    await form.getByRole('radio', { name: /Pubblica/ }).click();
    await form.getByRole('button', { name: 'Crea la lega' }).click();

    const switcher = page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ });
    await expect(switcher).toBeVisible({ timeout: 15_000 });
    await expect(switcher).toContainText('Presidente');
    const leagues = await db.collection('leagues').where('name', '==', 'Lega del giovedì').get();
    expect(leagues.size).toBe(1);
    expect(leagues.docs[0].data()).toMatchObject({ visibility: 'public', createdBy: 'p-1' });

    // nella nuova lega ci sono solo io: i giocatori dei Calcettari non si vedono
    await page.goto('/players');
    await expect(page.locator('text=Marco Test >> visible=true').first()).toBeVisible();
    await expect(page.getByText('Test Uno')).toHaveCount(0);

    // ritorno ai Calcettari: tornano i loro giocatori
    await page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ }).click();
    await page.getByRole('menuitemradio', { name: /I Calcettari/ }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible();
    await expect(page.locator('text=Test Uno >> visible=true').first()).toBeVisible();
    // la scelta resta dopo un ricaricamento
    await page.reload();
    await expect(page.getByRole('button', { name: /Lega attiva: I Calcettari/ })).toBeVisible();
  });

  test('senza leghe: benvenuto con "Crea" e "Unisciti"; un codice sbagliato è segnalato', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await expect(page.getByRole('heading', { name: 'Benvenuto in Club Soccer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crea una nuova lega' })).toBeVisible();
    await page.getByRole('button', { name: 'Unisciti con codice o link invito' }).click();
    await page.getByLabel('Codice o link di invito').fill('no');
    await page.getByRole('button', { name: 'Entra', exact: true }).click();
    await expect(page.getByText(/Codice non valido/)).toBeVisible();
    await page.getByLabel('Codice o link di invito').fill('https://club.example.com/join/abcdef123');
    await page.getByRole('button', { name: 'Entra', exact: true }).click();
    await expect(page).toHaveURL(/\/join\/abcdef123$/);
    await expect(page.getByRole('heading', { name: 'Invito alla lega' })).toBeVisible();
  });

  test('senza leghe: crea la prima lega e ci entra', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await page.getByRole('button', { name: 'Crea una nuova lega' }).click();
    await page.getByRole('dialog').getByLabel('Nome della lega').fill('I Nuovi');
    await page.getByRole('dialog').getByRole('button', { name: 'Crea la lega' }).click();
    await expect(page.getByRole('button', { name: /Lega attiva: I Nuovi/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Benvenuto in Club Soccer' })).toHaveCount(0);
  });
});
