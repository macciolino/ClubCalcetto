import { expect, test } from '@playwright/test';
import { db, lg, loginAsAdmin, romeDay, seedMatchDay } from './seed';

/** Smaller format → teams rebalanced on their own and "Conferma partita" again; bell: delete one / all, scroll. */
test.describe('Cambio formato e campanella', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('da 7vs7 a 5vs5: squadre ribilanciate da sole, partita da confermare di nuovo, avviso ai gestori', async ({ page }) => {
    const day = romeDay(2);
    const ids = ['p-1', ...Array.from({ length: 10 }, (_, i) => `t${i + 1}`), 'x1', 'x2', 'x3'];
    const now = new Date().toISOString();
    for (const id of ['x1', 'x2', 'x3']) {
      await lg(`players/${id}`).set({ id, full_name: `Ospite ${id}`, is_guest: true, userId: null, leagueRole: 'PLAYER', position: 'Esterno', stats: { Tiro: 6 }, overall_rating: 6, created_at: now });
    }
    for (let i = 0; i < ids.length; i++) {
      await lg(`presences/${day}_${ids[i]}`).set({ id: `${day}_${ids[i]}`, date: day, player_id: ids[i], status: 'confirmed', order_index: i + 1, created_at: new Date(Date.now() - (40 - i) * 60_000).toISOString() });
    }
    await lg('settings/match_formats').set({ days: { [day]: { format: '7v7', formation: '2-3-1' } } });
    const team = (list: string[]) => list.map((id) => ({ id, name: id }));
    await lg(`generated_teams/${day}`).set({ id: day, date: day, team_white: team(ids.slice(0, 7)), team_black: team(ids.slice(7)), confirmed: true, created_at: now });

    await loginAsAdmin(page);
    await page.goto(`/teams?date=${day}`);
    await page.getByRole('button', { name: /Formato: 7vs7/ }).click();
    await page.getByRole('radio', { name: /5vs5/ }).first().click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect.poll(async () => (await lg(`generated_teams/${day}`).get()).data()?.team_white?.length, { timeout: 20_000 }).toBe(5);
    expect((await lg(`generated_teams/${day}`).get()).data()?.confirmed).toBe(false);
    await expect(page.getByRole('button', { name: 'Conferma partita' })).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await db.collection('profiles/p-1/notifications').get()).docs.map((d) => d.data().title), { timeout: 15_000 })
      .toContain('📉 Partita ridotta a 5vs5');
  });

  test('campanella: oltre 10 notifiche si scorre; si cancella una notifica o tutte', async ({ page }) => {
    const base = Date.now();
    for (let i = 0; i < 12; i++) {
      await db.collection('profiles/p-1/notifications').add({ title: `Avviso ${i + 1}`, body: 'Testo di prova', url: '/', read: true, created_at: new Date(base - i * 60_000).toISOString() });
    }
    await loginAsAdmin(page);
    await page.getByRole('button', { name: /^Notifiche/ }).first().click();
    const list = page.getByRole('list', { name: '12 notifiche' });
    await expect(list).toBeVisible();
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    await page.getByRole('button', { name: 'Cancella la notifica "Avviso 1"' }).click();
    await expect(page.getByRole('list', { name: '11 notifiche' })).toBeVisible();
    await expect.poll(async () => (await db.collection('profiles/p-1/notifications').get()).size).toBe(11);

    await page.getByRole('button', { name: 'Cancella tutte' }).click();
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(page.getByText('Nessuna notifica', { exact: true })).toBeVisible({ timeout: 15_000 });
    expect((await db.collection('profiles/p-1/notifications').get()).size).toBe(0);
  });
});
