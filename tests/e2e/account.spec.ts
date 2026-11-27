import { expect, test } from '@playwright/test';
import { db, loginAs, seedAccountWithoutLeague, seedMatchDay, waitForDoc } from './seed';

/**
 * "Il mio account" (docs/ARCHITECTURE.md §3.1): what belongs to the PERSON is reachable also with no league — Radar Base,
 * language, theme, notifications, sign-out — while Profilo and Impostazioni (the league's pages) stay behind a league.
 */
test.describe('Il mio account, anche senza lega', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('senza lega: il benvenuto rimanda a "Il mio account"; si cambia il Radar Base e si vedono le preferenze', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    // account precedente al Radar Base: nessuno step, nessun valore salvato
    await loginAs(page, acc.email, acc.password);
    await expect(page.getByRole('heading', { name: 'Benvenuto in Club Soccer' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('link', { name: 'Il mio account' }).click();
    await page.waitForURL('**/account');

    await expect(page.getByRole('heading', { name: 'Il mio account', level: 1 })).toBeVisible();
    // senza lega la schermata è pulita: nessuna barra delle pagine (porterebbero solo al benvenuto) e il menu utente
    // offre "Il mio account" al posto di Profilo e Impostazioni
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' })).toHaveCount(0);
    await page.getByTitle('Menu utente').click();
    await expect(page.getByRole('menuitem', { name: 'Il mio account' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Profilo' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Impostazioni' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
    await page.keyboard.press('Escape');
    // anche la Bacheca, l'altra pagina aperta a chi non ha una lega
    await page.goto('/board');
    await expect(page.getByRole('heading', { name: 'Cerco giocatore', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' })).toHaveCount(0);
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Il mio Radar Base' })).toBeVisible();
    await expect(page.getByText('Non l’hai ancora impostato', { exact: false })).toBeVisible();
    // preferenze e account, tutto raggiungibile senza lega
    await expect(page.getByRole('button', { name: /Lingua/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tema/ })).toBeVisible();
    await expect(page.getByText('Accesso e account')).toBeVisible();

    // imposta il Radar Base: tutto a 6 con Tiro a 9
    await page.locator('#stat-Tiro').fill('9');
    await page.getByRole('button', { name: 'Imposta il Radar Base' }).click();
    await expect(page.getByText('Radar Base salvato.')).toBeVisible({ timeout: 15_000 });
    const p = (await db.doc('profiles/e2e-nolega').get()).data()!;
    expect(p.baseRadar).toMatchObject({ Tiro: 9, Fisico: 6 });

    // si può cambiare ancora; il pulsante resta spento finché non cambia nulla
    await expect(page.getByRole('button', { name: 'Salva il Radar Base' })).toBeDisabled();
    await page.locator('#stat-Difesa').fill('3');
    await page.getByRole('button', { name: 'Salva il Radar Base' }).click();
    const second = await waitForDoc('profiles/e2e-nolega', (d) => d?.baseRadar?.Difesa === 3);
    expect(second?.baseRadar).toMatchObject({ Tiro: 9, Difesa: 3 });

    // le pagine della lega restano dietro una lega
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Benvenuto in Club Soccer' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Benvenuto in Club Soccer' })).toBeVisible({ timeout: 15_000 });
  });

  test('con una lega: dal Profilo si arriva al Radar Base e i valori della lega non cambiano', async ({ page }) => {
    await db.doc('profiles/p-1').update({ baseRadar: { Velocità: 6, Fisico: 6, Resistenza: 6, Tiro: 6, Passaggio: 6, Dribbling: 6, Difesa: 6, Visione: 6 } });
    await page.goto('/login');
    await page.locator('#auth-email').fill('macciolino84@gmail.com');
    await page.locator('#auth-password').fill('password123');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 60_000 });

    await page.goto('/profile');
    // con una lega le barre e il menu completo restano
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).first()).toBeVisible({ timeout: 20_000 });
    await page.getByTitle('Menu utente').click();
    await expect(page.getByRole('menuitem', { name: 'Profilo' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Impostazioni' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Modifica il Radar Base' }).click();
    await page.waitForURL('**/account');
    await page.locator('#stat-Tiro').fill('10');
    await page.getByRole('button', { name: 'Salva il Radar Base' }).click();
    const saved = await waitForDoc('profiles/p-1', (d) => d?.baseRadar?.Tiro === 10);
    expect(saved?.baseRadar).toMatchObject({ Tiro: 10 });
    // la scheda nella lega di prova è rimasta quella di prima
    expect((await db.doc('leagues/calcettari/players/p-1').get()).data()).toMatchObject({ stats: { Tiro: 6 }, overall_rating: 6 });
  });
});
