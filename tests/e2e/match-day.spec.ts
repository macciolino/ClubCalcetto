import { expect, test } from '@playwright/test';
import { PLAYERS, loginAsAdmin, seedMatchDay, waitForDoc } from './seed';

/**
 * Admin journeys in Impostazioni → Partita della settimana (phone layout: master day selector + 3 tabs).
 */
test.describe('Partita della settimana (admin, telefono)', () => {
  let date: string;

  test.beforeEach(async ({ page }) => {
    ({ date } = await seedMatchDay());
    await loginAsAdmin(page);
    await page.goto('/settings?sezione=partita');
    // Selettore master: il giorno di ieri, con le squadre fatte e ancora da chiudere
    await page.getByRole('radio', { name: /Da chiudere, 10 su 10/ }).click();
  });

  test('Cassa: da "Da saldare" a "Pagato" con la barra che si aggiorna e il salvataggio su Firestore', async ({ page }) => {
    await page.getByRole('tab', { name: /Cassa/ }).click();
    const bar = page.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('Giocatori delle squadre salvate in Squadre.')).toBeVisible();

    const row = page.getByRole('button', { name: new RegExp(PLAYERS[0].name) });
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await expect(row).toContainText('Da saldare');
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(row).toContainText('Pagato');
    await expect(bar).toHaveAttribute('aria-valuenow', '10');
    await expect(page.getByText(/1 su 10 hanno pagato/)).toBeVisible();

    // salvato davvero, e solo quel giocatore
    const saved = await waitForDoc(`match_payments/${date}`, (d) => d?.payments?.[PLAYERS[0].id] === true);
    expect(Object.keys(saved!.payments)).toEqual([PLAYERS[0].id]);

    // filtro "Da saldare": restano in 9
    await page.getByRole('radio', { name: /Da saldare \(9\)/ }).click();
    await expect(page.getByRole('button', { name: new RegExp(PLAYERS[0].name) })).toHaveCount(0);

    // "Tutti pagati": barra al 100%
    await page.getByRole('button', { name: /Tutti pagati/ }).click();
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await waitForDoc(`match_payments/${date}`, (d) => PLAYERS.every((p) => d?.payments?.[p.id] === true));
  });

  test('Chiusura: risultato con gli stepper, MVP e archiviazione', async ({ page }) => {
    // giorno "Da chiudere": si apre già la scheda Risultato
    await expect(page.getByRole('tab', { name: /Risultato/ })).toHaveAttribute('aria-selected', 'true');

    const plusWhite = page.getByRole('button', { name: 'Un gol in più ai Bianchi' });
    await plusWhite.click();
    await plusWhite.click();
    await page.getByRole('button', { name: 'Un gol in più ai Neri' }).click();
    await expect(page.getByLabel('Gol Bianchi')).toHaveValue('2');
    await expect(page.getByLabel('Gol Neri')).toHaveValue('1');

    await page.getByLabel('MVP della partita').selectOption(PLAYERS[0].id);
    await page.getByRole('button', { name: 'Salva e archivia partita' }).click();

    const match = await waitForDoc(`matches/${date}`, (d) => d?.status === 'completed');
    expect(match).toMatchObject({ score_white: 2, score_black: 1, mvp_player_id: PLAYERS[0].id });
    expect(match!.team_white.map((p: { id: string }) => p.id)).toEqual(PLAYERS.slice(0, 5).map((p) => p.id));

    // vittorie / sconfitte aggiornate sui profili
    await waitForDoc(`profiles/${PLAYERS[0].id}`, (d) => d?.matches_won === 1);
    await waitForDoc(`profiles/${PLAYERS[5].id}`, (d) => d?.matches_lost === 1);

    // la pagina mostra la partita come archiviata
    await expect(page.getByRole('button', { name: 'Aggiorna risultato' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Archiviata/ })).toBeVisible();
  });
});
