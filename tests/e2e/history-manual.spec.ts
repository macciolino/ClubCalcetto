import { expect, test } from '@playwright/test';
import { PLAYERS, db, lg, loginAsAdmin, romeDay, seedMatchDay } from './seed';

/**
 * Storico → "Aggiungi partita": a past match never archived (forgotten, or written on paper). Players from the league
 * and a guest created on the spot; saved like any archived match (W/D/L on the cards, leaderboard).
 */
test.describe('Storico: partita passata inserita a mano', () => {
  test('il presidente aggiunge una partita di carta con un nuovo ospite: conta come le altre', async ({ page }) => {
    await seedMatchDay();
    const day = romeDay(-40);
    await loginAsAdmin(page);
    await page.goto('/history');
    await page.getByRole('button', { name: 'Aggiungi partita' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Aggiungi una partita passata')).toBeVisible();

    await sheet.locator('#add-date').fill(day);
    await sheet.locator('#add-place').fill('Campo di carta');
    // Bianchi: Uno + un nuovo ospite; Neri: Due
    await sheet.getByLabel('Aggiungi ai Bianchi').selectOption({ label: PLAYERS[0].name });
    await sheet.getByLabel('Nuovo ospite nei Bianchi').fill('Zio Pino');
    await sheet.getByLabel('Nuovo ospite nei Bianchi').press('Enter');
    await sheet.getByLabel('Aggiungi ai Neri').selectOption({ label: PLAYERS[1].name });
    await expect(sheet.locator('li').filter({ hasText: 'Zio Pino' })).toBeVisible();

    // Bianchi vincono 1-0
    await sheet.getByRole('button', { name: /Un gol in più ai Bianchi/ }).click();
    await sheet.getByRole('button', { name: 'Salva nello Storico' }).click();
    await expect(page.getByText('Partita aggiunta allo Storico.')).toBeVisible({ timeout: 15_000 });

    const match = (await lg(`matches/${day}`).get()).data()!;
    expect(match).toMatchObject({ status: 'completed', entered_by_hand: true, location: 'Campo di carta' });
    const ids = [...match.team_white, ...match.team_black].map((p: { id: string }) => p.id);
    expect(ids).toHaveLength(3);
    const guestId = match.team_white.find((p: { name: string }) => p.name === 'Zio Pino').id as string;
    const guest = (await lg(`players/${guestId}`).get()).data()!;
    expect(guest).toMatchObject({ full_name: 'Zio Pino', is_guest: true });
    // il risultato conta sulle schede (vittoria per i Bianchi se hanno segnato)
    const outcome = match.score_white > match.score_black ? 'matches_won' : match.score_white === match.score_black ? 'matches_drawn' : 'matches_lost';
    expect(guest[outcome]).toBe(1);
    expect((await lg(`players/${PLAYERS[0].id}`).get()).data()?.[outcome]).toBe(1);

    // nello Storico, e la stessa data non si può inserire due volte
    await expect(page.getByText('Zio Pino').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Aggiungi partita' }).click();
    await page.getByRole('dialog').locator('#add-date').fill(day);
    await page.getByRole('dialog').getByRole('button', { name: 'Salva nello Storico' }).click();
    await expect(page.getByText('In quel giorno c’è già una partita nello Storico: aprila e modificala.')).toBeVisible();
    expect(await db.collection('leagues/calcettari/matches').where('match_date', '==', day).get().then((s) => s.size)).toBe(1);
  });
});
