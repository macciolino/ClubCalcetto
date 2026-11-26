import { expect, test } from '@playwright/test';
import { auth, db, lg, loginAs, loginAsAdmin, seedMatchDay, waitForDoc } from './seed';

/**
 * Review of a new player's initial values (docs/ARCHITECTURE.md, "Registrazione e Radar Base"): managers see the
 * "Da revisionare" badge and filter, open the card from the notification link, confirm the values as they are or
 * correct them (both → CONFIRMED); the player sees a discreet note under the radar, never a badge or an alert.
 */
const BANNER = 'Valori iniziali impostati dal giocatore in attesa di conferma';
const OWN_NOTE = 'Valori iniziali · in attesa di revisione del gestore';

async function markUnconfirmed(ids: string[]) {
  for (const id of ids) {
    await lg(`players/${id}`).update({ stat_status: 'UNCONFIRMED', needs_stat_review: true, stats: { Velocità: 6, Tiro: 9, Difesa: 6 }, overall_rating: 7 });
  }
}

test.describe('Valori iniziali da revisionare', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
    // the league's own parameters (the editor lists them)
    for (const [i, name] of ['Velocità', 'Tiro', 'Difesa'].entries()) await lg(`stat_categories/c${i}`).set({ id: `c${i}`, name, default_value: 6 });
    await markUnconfirmed(['t1', 't2']);
  });

  test('il gestore vede badge e filtro, apre la scheda dal link dell’avviso e conferma i valori così come sono', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/players');

    // badge sobrio sulle schede in attesa e filtro rapido con il conteggio
    const uno = page.getByRole('button', { name: /^Test Uno, .*OVR/ });
    await expect(uno).toContainText('Da revisionare', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Test Tre, .*OVR/ })).not.toContainText('Da revisionare');
    const chip = page.getByRole('button', { name: 'Da revisionare (2)' });
    await chip.click();
    await expect(page.getByRole('button', { name: /^Test .*, .*OVR/ })).toHaveCount(2);
    await chip.click();
    await expect(page.getByRole('button', { name: /^Test .*, .*OVR/ })).toHaveCount(10);

    // il link dell'avviso apre direttamente la scheda del giocatore, con il banner in cima
    await page.goto('/players?player=t1');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText(BANNER, { timeout: 20_000 });
    await expect(sheet).not.toContainText('Verificato');

    // "Conferma valori" senza modifiche: CONFIRMED, i valori restano quelli iniziali
    await sheet.getByRole('button', { name: 'Conferma valori' }).click();
    const card = await waitForDoc('leagues/calcettari/players/t1', (d) => d?.stat_status === 'CONFIRMED');
    expect(card).toMatchObject({ needs_stat_review: false, stat_reviewed_by: 'p-1', overall_rating: 7, stats: { Tiro: 9 } });
    await expect(page.getByText('Valori di Test Uno confermati.')).toBeVisible();

    // il badge sparisce solo per lui, compare il "Verificato" e il conteggio scende
    await expect(page.getByRole('button', { name: /^Test Uno, .*OVR/ })).not.toContainText('Da revisionare');
    await expect(page.getByRole('button', { name: 'Da revisionare (1)' })).toBeVisible();
    await page.getByRole('button', { name: /^Test Uno, .*OVR/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Verificato');
    await expect(page.getByRole('dialog')).not.toContainText(BANNER);
  });

  test('l’avviso nel campanello apre la scheda del giocatore, anche se si è già sulla pagina Giocatori', async ({ page }) => {
    await db.doc('profiles/p-1/notifications/n-rev').set({
      title: '🆕 Nuovo giocatore in lega',
      body: 'Test Due si è unito alla lega · Valori da revisionare',
      url: '/players?player=t2',
      created_at: new Date().toISOString(),
      read: false,
    });
    await loginAsAdmin(page);
    await page.goto('/players');
    await expect(page.getByRole('button', { name: /^Test Uno, .*OVR/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /^Notifiche/ }).click();
    await page.getByRole('button', { name: /Nuovo giocatore in lega/ }).first().click();
    await expect(page.getByRole('dialog')).toContainText(BANNER, { timeout: 15_000 });
    await expect(page.getByRole('dialog')).toContainText('Test Due');
  });

  test('correggere un valore e salvare conferma la scheda; una modifica solo del ruolo no', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/players?player=t2');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText(BANNER, { timeout: 20_000 });

    // solo il ruolo: i valori restano in attesa
    await sheet.getByRole('button', { name: 'Modifica giocatore' }).click();
    const form = page.getByRole('dialog');
    await form.locator('select').first().selectOption('Difensore');
    await form.getByRole('button', { name: 'Salva modifiche' }).click();
    await waitForDoc('leagues/calcettari/players/t2', (d) => d?.position === 'Difensore');
    expect((await db.doc('leagues/calcettari/players/t2').get()).data()?.stat_status).toBe('UNCONFIRMED');

    // un parametro corretto: CONFIRMED con il valore nuovo
    await page.goto('/players?player=t2');
    await expect(page.getByRole('dialog')).toContainText(BANNER, { timeout: 20_000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Modifica giocatore' }).click();
    await page.getByRole('dialog').locator('input[type="range"]').first().fill('3');
    await page.getByRole('dialog').getByRole('button', { name: 'Salva modifiche' }).click();
    const card = await waitForDoc('leagues/calcettari/players/t2', (d) => d?.stat_status === 'CONFIRMED');
    expect(card).toMatchObject({ needs_stat_review: false, stat_reviewed_by: 'p-1' });
    expect(Object.values(card!.stats as Record<string, number>)).toContain(3);
  });

  test('il giocatore vede il radar completo e una nota discreta, senza badge né banner né pulsante di conferma', async ({ page }) => {
    await auth.createUser({ uid: 't1', email: 't1@example.com', password: 'password123', emailVerified: true, displayName: 'Test Uno' });
    await db.doc('memberships/t1').set({ leagues: { calcettari: { player_id: 't1', league_role: 'PLAYER', name: 'I Calcettari' } } });
    await loginAs(page, 't1@example.com', 'password123');

    // profilo personale: radar + nota sotto
    await page.goto('/profile');
    await expect(page.getByText(OWN_NOTE)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Da revisionare')).toHaveCount(0);

    // la sua scheda aperta dall'elenco: nota, nessun banner da gestore né pulsante di conferma
    await page.goto('/players?player=t1');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText(OWN_NOTE, { timeout: 20_000 });
    await expect(sheet).not.toContainText(BANNER);
    await expect(sheet.getByRole('button', { name: 'Conferma valori' })).toHaveCount(0);
    // il filtro è solo dei gestori
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Da revisionare \(/ })).toHaveCount(0);
  });
});
