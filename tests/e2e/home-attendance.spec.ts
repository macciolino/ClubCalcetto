import { expect, test } from '@playwright/test';
import { LEAGUE, PLAYERS, db, lg, loginAsAdmin, romeDay, seedMatchDay } from './seed';

/** Home and Presenze: Italian unchanged, English translates texts, weekdays and months. */
test.describe('Home e Presenze in italiano e in inglese', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('italiano: saluto e calendario', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: 'Ciao Marco', level: 1 })).toBeVisible();
    await expect(page.getByText('Prossima partita')).toBeVisible();
    await page.goto('/attendance');
    await expect(page.getByRole('heading', { name: 'Presenze', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calendario' })).toBeVisible();
  });

  test('campo riga per riga e card "Ultima partita" con vincitori e badge', async ({ page }) => {
    await lg('sport_fields/f1').update({ notes: 'Parcheggio interno' });
    const day = romeDay(-8);
    await lg(`matches/${day}`).set({
      id: day,
      match_date: day,
      status: 'completed',
      score_white: 3,
      score_black: 5,
      team_white: PLAYERS.slice(0, 5),
      team_black: [{ id: 'p-1', name: 'Marco Test' }, ...PLAYERS.slice(5, 9)],
      mvp_player_id: 't1',
    });
    await loginAsAdmin(page);

    const place = page.getByRole('group', { name: 'Campo' });
    await expect(place.getByText('Campo Test', { exact: true })).toBeVisible();
    await expect(place.getByText('Via dei Test 1', { exact: true })).toBeVisible();
    await expect(place.getByText('Parcheggio interno')).toBeVisible();
    await expect(place.getByRole('link', { name: 'Apri in Google Maps' })).toHaveAttribute('href', /google\.com\/maps.*query=Via%20dei%20Test%201$/);
    await expect(page.getByText('(Via dei Test 1)')).toHaveCount(0);

    const last = page.getByRole('region', { name: 'Ultima partita' });
    const board = last.getByRole('group', { name: 'Risultato' });
    await expect(board).toContainText('3–5');
    await expect(board.getByText('Vincitori')).toBeVisible();
    await expect(last.getByText('MVP Test Uno')).toBeVisible();
    await expect(last.getByText('La tua: vinta')).toBeVisible();
  });

  test('doppio tocco su "Ci sono": una sola iscrizione, nessun errore', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: 'Ci sono' }).dblclick();
    await expect(page.getByText(/Sei titolare \(n° 1\)/)).toBeVisible();
    await expect(page.getByText('Operazione non riuscita. Controlla la connessione e riprova.')).toHaveCount(0);
    // la pagina si aggiorna subito (copia locale di Firestore): sul server si aspetta che la scrittura arrivi
    const count = async () => (await db.collection(`${LEAGUE}/presences`).where('player_id', '==', 'p-1').get()).size;
    await expect.poll(count, { timeout: 10_000 }).toBe(1);
    await page.waitForTimeout(1500);
    expect(await count()).toBe(1);
  });

  test('inglese: Home, iscrizione e Presenze tradotte', async ({ page }) => {
    await db.doc('profiles/p-1').update({ locale: 'en' });
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: 'Hi Marco', level: 1 })).toBeVisible();
    await expect(page.getByText('Next match')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your performance' })).toBeVisible();

    // sign up from the Home and see the translated state
    await page.getByRole('button', { name: "I'm in" }).click();
    await expect(page.getByText(/You're a starter \(no\. 1\)/)).toBeVisible();

    await page.goto('/attendance');
    await expect(page.getByRole('heading', { name: 'Attendance', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByText('first to fill up this week')).toBeVisible();
    // the selected day card shows English weekday names
    const card = page.getByRole('region', { name: 'Selected day' });
    await expect(card.getByRole('heading', { level: 3 })).toHaveText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
  });
});

/** Un presidente che sfoglia i giorni nelle Presenze guarda quel giorno, ma non cambia il giorno ufficiale di tutti. */
test('Presenze: scegliere un giorno non cambia il giorno ufficiale e la scelta non rimbalza', async ({ page }) => {
  await seedMatchDay();
  const official = romeDay(1);
  const other = romeDay(3);
  await loginAsAdmin(page);
  await page.goto('/attendance');
  const pressed = () => page.locator('button[aria-pressed="true"]').first();
  const label = async (iso: string) => {
    const wd = new Date(iso + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', timeZone: 'Europe/Rome' });
    return new RegExp('^' + wd + ' ' + Number(iso.slice(8)) + ' ', 'i');
  };
  await expect(page.getByRole('button', { name: await label(official), pressed: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: await label(other) }).click();
  await expect(page.getByRole('button', { name: await label(other), pressed: true })).toBeVisible();
  // resta lì anche quando i dati della lega si aggiornano, e il giorno ufficiale su Firestore non è cambiato
  await page.waitForTimeout(3000);
  await expect(pressed()).toHaveAccessibleName(await label(other));
  expect((await db.doc('leagues/calcettari/settings/official_match').get()).data()?.date).toBe(official);
});
