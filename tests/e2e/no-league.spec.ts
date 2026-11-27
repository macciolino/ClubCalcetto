import { expect, test } from '@playwright/test';
import { db, loginAs, loginAsAdmin, seedAccountWithoutLeague, seedMatchDay, waitForDoc } from './seed';

/**
 * Account with no league (docs/ARCHITECTURE.md §3.1, point 9): one entry page that explains the app and gives the first
 * actions; bars with Inizio and Bacheca only; Profilo (global radar, Radar Base editable, career as a guest) and
 * Impostazioni (account part only) from the user menu. With a league everything stays as it was.
 */
const HERO = 'Il tuo calcetto, senza chat infinite.';
const RADAR = { Velocità: 6, Fisico: 6, Resistenza: 6, Tiro: 6, Passaggio: 6, Dribbling: 6, Difesa: 6, Visione: 6 };

test.describe('Senza lega', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('ingresso: spiegazione, azioni, cosa puoi fare, come si inizia, profilo in breve; barra con Inizio e Bacheca', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await expect(page.getByRole('heading', { name: HERO, level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Crea una lega' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ho un invito' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cerca una partita da giocare' })).toBeVisible();
    for (const h of ['Leghe pubbliche', 'Cosa puoi fare', 'Come si inizia', 'Il tuo profilo']) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible();
    }
    for (const f of ['Presenze', 'Squadre equilibrate', 'Statistiche e forma', 'Cerco giocatore']) {
      await expect(page.getByRole('heading', { name: f, level: 3 })).toBeVisible();
    }
    // Radar Base non ancora impostato: il primo passo non è spuntato
    await expect(page.getByRole('link', { name: 'Impostalo' })).toBeVisible();
    await expect(page.getByText('Radar Base da impostare')).toBeVisible();

    // barra: Inizio e Bacheca, niente pagine della lega
    const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
    await expect(nav.getByRole('link', { name: /Inizio/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Bacheca/ })).toBeVisible();
    for (const n of ['Presenze', 'Giocatori', 'Squadre', 'Storico']) await expect(nav.getByRole('link', { name: new RegExp(n) })).toHaveCount(0);
    // menu utente: Profilo, Impostazioni, Logout
    await page.getByTitle('Menu utente').click();
    for (const m of ['Profilo', 'Impostazioni', 'Logout']) await expect(page.getByRole('menuitem', { name: m })).toBeVisible();
    await page.keyboard.press('Escape');

    // una pagina della lega aperta dall'indirizzo mostra l'ingresso, con l'intestazione
    await page.goto('/attendance');
    await expect(page.getByRole('heading', { name: HERO, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle('Menu utente')).toBeVisible();
    // il vecchio indirizzo "Il mio account" porta al Profilo
    await page.goto('/account');
    await page.waitForURL('**/profile');
  });

  test('Profilo: chi sei, Radar globale con il Radar Base modificabile, Carriera; Impostazioni ridotte', async ({ page }) => {
    const acc = await seedAccountWithoutLeague();
    await loginAs(page, acc.email, acc.password);
    await page.getByTitle('Menu utente').click({ timeout: 20_000 });
    await page.getByRole('menuitem', { name: 'Profilo' }).click();
    await page.waitForURL('**/profile');
    await expect(page.getByRole('heading', { name: 'Profilo', level: 1 })).toBeVisible();
    await expect(page.getByText('Non fai ancora parte di una lega')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Radar globale' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Carriera' })).toBeVisible();

    // imposta il Radar Base dalla finestra
    await page.getByRole('button', { name: 'Imposta il Radar Base' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.locator('#stat-Tiro').fill('9');
    await sheet.getByRole('button', { name: 'Salva il Radar Base' }).click();
    const p = await waitForDoc('profiles/e2e-nolega', (d) => d?.baseRadar?.Tiro === 9);
    expect(p?.baseRadar).toMatchObject({ Tiro: 9, Fisico: 6 });
    await expect(page.getByRole('button', { name: 'Modifica il Radar Base' })).toBeVisible({ timeout: 15_000 });

    // l'ingresso ora spunta il primo passo
    await page.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: /Inizio/ }).first().click();
    await expect(page.getByRole('link', { name: 'Modificalo' })).toBeVisible({ timeout: 15_000 });

    // Impostazioni: solo la parte dell'account
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Impostazioni', level: 1 })).toBeVisible({ timeout: 15_000 });
    for (const s of ['Notifiche', 'Account']) await expect(page.getByRole('link', { name: new RegExp(`^${s}`) }).first()).toBeVisible();
    for (const s of ['Lingua', 'Tema']) await expect(page.getByRole('button', { name: new RegExp(s) })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Lega/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Partita della settimana/ })).toHaveCount(0);
    await page.getByRole('link', { name: /^Account/ }).first().click();
    await expect(page.getByRole('button', { name: /Esci da tutti i dispositivi/ })).toBeVisible({ timeout: 15_000 });
  });

  test('con una lega: barre e menu come sempre; dal Profilo il Radar Base cambia ma la scheda della lega no', async ({ page }) => {
    await db.doc('profiles/p-1').update({ baseRadar: RADAR });
    await loginAsAdmin(page);
    await expect(page.getByRole('navigation', { name: 'Navigazione principale' }).first().getByRole('link', { name: /Presenze/ })).toBeVisible({ timeout: 20_000 });
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Modifica il Radar Base' }).click({ timeout: 20_000 });
    await page.getByRole('dialog').locator('#stat-Tiro').fill('10');
    await page.getByRole('dialog').getByRole('button', { name: 'Salva il Radar Base' }).click();
    await waitForDoc('profiles/p-1', (d) => d?.baseRadar?.Tiro === 10);
    expect((await db.doc('leagues/calcettari/players/p-1').get()).data()).toMatchObject({ stats: { Tiro: 6 }, overall_rating: 6 });
  });
});
