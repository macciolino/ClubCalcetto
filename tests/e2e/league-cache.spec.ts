import { expect, test } from '@playwright/test';
import { auth, db, loginAs, loginAsAdmin, seedMatchDay } from './seed';

/**
 * Chi è di due leghe: i dati tenuti sul dispositivo (campi, giocatori, impostazioni…) sono sempre quelli della lega
 * attiva. All'avvio, prima che la lega attiva sia nota, le pagine non devono leggere (né salvare) i dati di un'altra lega.
 */
test('due leghe: aprendo la lega senza campi non compare un campo dell’altra lega', async ({ page }) => {
  await seedMatchDay(); // I Calcettari: campo "Campo Test", 10 giocatori
  await db.doc('leagues/giovedi').set({ id: 'giovedi', name: 'Lega del giovedì', slug: 'lega-del-giovedi', status: 'active', visibility: 'private', createdAt: new Date().toISOString(), createdBy: 'p-1' });
  await db.doc('leagues/giovedi/players/p-1').set({ id: 'p-1', userId: 'e2e-super', user_id: 'e2e-super', full_name: 'Marco Test', leagueRole: 'PRESIDENT', role: 'admin', isActivePlayer: true, is_guest: false, stats: {}, overall_rating: 6 });
  await db.doc('memberships/e2e-super').set(
    { leagues: { calcettari: { player_id: 'p-1', league_role: 'PRESIDENT', name: 'I Calcettari' }, giovedi: { player_id: 'p-1', league_role: 'PRESIDENT', name: 'Lega del giovedì' } } }
  );
  // Il dispositivo ricorda la lega del giovedì (già attiva e proprietaria delle copie locali)
  await page.addInitScript(() => {
    localStorage.setItem('cc_league', 'giovedi');
    localStorage.setItem('cc_cache_league', 'giovedi');
  });
  await loginAsAdmin(page);
  await expect(page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000);
  // nessuna copia di dati di I Calcettari sul dispositivo
  const cache = await page.evaluate(() => ({
    fields: localStorage.getItem('clubcalcetto_sport_fields') || '',
    players: localStorage.getItem('clubcalcetto_players_list') || '',
    settings: localStorage.getItem('clubcalcetto_app_settings') || '',
  }));
  expect(cache.fields).not.toContain('Campo Test');
  expect(cache.players).not.toContain('Test Uno');
  await page.goto('/teams');
  await page.waitForTimeout(4000);
  await expect(page.getByText('Campo Test')).toHaveCount(0);
  // la lega non ha campi: dopo aver aperto le pagine la copia resta vuota, non si riempie di campi dimostrativi
  const after = await page.evaluate(() => localStorage.getItem('clubcalcetto_sport_fields') || '[]');
  expect(JSON.parse(after)).toEqual([]);
});

/** Chi non è di I Calcettari non produce letture negate verso quella lega mentre l'app capisce qual è la sua lega attiva. */
test('membro di un’altra lega: nessun avviso di permesso negato al caricamento', async ({ page }) => {
  await seedMatchDay();
  await auth.createUser({ uid: 'solo-giovedi', email: 'giovedi@example.com', password: 'password123', emailVerified: true, displayName: 'Gianni Giovedì' });
  const now = new Date().toISOString();
  await db.doc('profiles/solo-giovedi').set({ id: 'solo-giovedi', user_id: 'solo-giovedi', full_name: 'Gianni Giovedì', avatar_url: null, role: 'player', position: 'Esterno', is_guest: false, stats: {}, overall_rating: 6, matches_won: 0, matches_drawn: 0, matches_lost: 0, created_at: now, updated_at: now });
  await db.doc('leagues/giovedi').set({ id: 'giovedi', name: 'Lega del giovedì', slug: 'lega-del-giovedi', status: 'active', visibility: 'private', createdAt: now, createdBy: 'p-1' });
  await db.doc('leagues/giovedi/players/solo-giovedi').set({ id: 'solo-giovedi', userId: 'solo-giovedi', user_id: 'solo-giovedi', full_name: 'Gianni Giovedì', leagueRole: 'PLAYER', role: 'player', isActivePlayer: true, is_guest: false, stats: {}, overall_rating: 6 });
  await db.doc('memberships/solo-giovedi').set({ leagues: { giovedi: { player_id: 'solo-giovedi', league_role: 'PLAYER', name: 'Lega del giovedì' } } });
  const denied: string[] = [];
  page.on('console', (m) => {
    if (/permission|evaluation error|Missing or insufficient/i.test(m.text())) denied.push(page.url() + ' ' + m.text().slice(0, 80) + ' @' + (m.location().url || '').slice(-40));
  });
  await loginAs(page, 'giovedi@example.com', 'password123');
  await expect(page.getByRole('button', { name: /Lega attiva: Lega del giovedì/ })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000);
  expect(denied).toEqual([]);
});
