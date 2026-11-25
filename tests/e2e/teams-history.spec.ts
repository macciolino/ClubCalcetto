import { expect, test } from '@playwright/test';
import { LEAGUE, PLAYERS, db, loginAsAdmin, romeDay, seedMatchDay } from './seed';

/** Squadre and Storico: Italian stays as it was, English translates labels, pitch places and dates. */
test.describe('Squadre e Storico in italiano e in inglese', () => {
  let date: string;

  test.beforeEach(async () => {
    ({ date } = await seedMatchDay());
  });

  test('Squadre in italiano: stato, campo e sigle dei ruoli', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/teams?date=${date}`);
    await expect(page.getByRole('heading', { name: 'Squadre', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Partita confermata' })).toBeVisible();
    await expect(page.getByText('BIANCHI', { exact: true })).toBeVisible();
    // portiere a rotazione (impostazione di default): la porta è "PORTA ↻"
    await expect(page.getByText('PORTA ↻', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('EST SX', { exact: true }).first()).toBeVisible();
  });

  test('Squadre in inglese: stato, schede, campo, equilibrio e voto MVP', async ({ page }) => {
    await db.doc('profiles/p-1').update({ locale: 'en' });
    await loginAsAdmin(page);
    await page.goto(`/teams?date=${date}`);
    await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Match confirmed' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Pitch/ })).toBeVisible();
    await expect(page.getByText('WHITES', { exact: true })).toBeVisible();
    await expect(page.getByText('GOAL ↻', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('W L', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Balance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vote the MVP of the day' })).toBeVisible();

    // modifica manuale: sigle e testi tradotti
    await page.getByRole('tab', { name: /Manual edit/ }).click();
    await expect(page.getByText('Tap a player and then another one to swap their team or role.')).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(PLAYERS[0].name) }).first()).toContainText('GOAL ↻');
  });

  test('Storico in inglese: classifica, partite, calendario e dettaglio', async ({ page }) => {
    const toTeam = (list: typeof PLAYERS) => list.map((p) => ({ id: p.id, name: p.name }));
    await db.doc(`${LEAGUE}/matches/${date}`).set({
      id: date,
      match_date: date,
      status: 'completed',
      score_white: 3,
      score_black: 1,
      team_white: toTeam(PLAYERS.slice(0, 5)),
      team_black: toTeam(PLAYERS.slice(5)),
      mvp_player_id: PLAYERS[0].id,
      scorers: [{ player_id: PLAYERS[0].id, player_name: PLAYERS[0].name, goals: 2 }],
      total_cost: 80,
    });
    await db.doc('profiles/p-1').update({ locale: 'en' });
    await loginAsAdmin(page);
    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Season').locator('option').first()).toHaveText('All seasons');
    await expect(page.getByText('1 match', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('radio', { name: /Leaderboard/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/^1 match ·/).first()).toBeVisible();

    await page.getByRole('radio', { name: /Matches/ }).click();
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^1 match$/ })).toBeVisible(); // conteggio del mese nel calendario
    await page.locator('ul li button').filter({ hasText: '3' }).first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Whites win')).toBeVisible();
    await expect(sheet.getByText(/Pitch €80 · €8\.00 each/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Edit' })).toBeVisible();
  });
});

/** Primo accesso su un dispositivo (nessuna copia del giorno ufficiale): Squadre parte dal giorno ufficiale, non da oggi. */
test('Squadre: senza copia locale si apre sul giorno ufficiale e lo segue finché non scegli un giorno', async ({ page }) => {
  await seedMatchDay();
  await loginAsAdmin(page);
  await page.evaluate(() => localStorage.removeItem('clubcalcetto_official_match_date'));
  await page.goto('/teams');
  const tile = (iso: string) => {
    const wd = new Date(iso + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'short', timeZone: 'Europe/Rome' });
    return new RegExp('^(Giorno ufficiale )?' + wd + ' ' + Number(iso.slice(8)) + ' ', 'i');
  };
  // il giorno ufficiale (domani) è quello scelto e porta l'etichetta; oggi no
  const official = page.getByRole('button', { name: tile(romeDay(1)), pressed: true });
  await expect(official).toBeVisible({ timeout: 15_000 });
  await expect(official).toHaveAccessibleName(/^Giorno ufficiale/);
  // se scegli un altro giorno, resti lì
  await page.getByRole('button', { name: tile(romeDay(3)), pressed: false }).click();
  await expect(page.getByRole('button', { name: tile(romeDay(3)), pressed: true })).toBeVisible();
});

/** Lega senza campi propri: nessuna pagina usa un campo rimasto sul dispositivo (anche di altre leghe), il prezzo è lo stesso ovunque. */
test('Home e Squadre: lega senza campi, stesso prezzo e nessun campo di altre leghe', async ({ page }) => {
  await seedMatchDay();
  await db.doc('leagues/calcettari/settings/app_config').delete();
  await db.doc('leagues/calcettari/sport_fields/f1').delete();
  await loginAsAdmin(page);
  await page.evaluate(() => {
    localStorage.setItem('clubcalcetto_sport_fields', JSON.stringify([{ id: 'zz', name: 'Campo Altrove', address: 'Via Altrove 9', cost: 60 }]));
  });
  await page.goto('/');
  await expect(page.getByText('5vs5 · €8 a testa')).toBeVisible({ timeout: 15_000 });
  await page.goto('/teams');
  await expect(page.getByRole('heading', { name: 'Squadre', level: 1 })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3000); // i dati della lega arrivano dopo il primo disegno
  await expect(page.getByText('€8,00 a testa')).toBeVisible();
  await expect(page.getByText('Campo Altrove')).toHaveCount(0);
});
