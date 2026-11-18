import { expect, test } from '@playwright/test';
import { loginAsAdmin, seedMatchDay } from './seed';

/** C9: an unknown address shows the app's own page (not the raw Next.js one), with the way back to Home. */
test.describe('Pagine di errore', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('indirizzo inesistente: pagina "non trovata" dell’app, con ritorno alla Home', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pagina-che-non-esiste');
    await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toBeVisible();
    await page.getByRole('link', { name: /Torna alla Home/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
