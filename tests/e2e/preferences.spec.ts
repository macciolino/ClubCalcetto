import { expect, test } from '@playwright/test';
import { db, loginAsAdmin, seedMatchDay, waitForDoc } from './seed';

/** Impostazioni → Lingua / Tema: applied at once, saved on the profile, applied again on another device. */
test.describe('Preferenze personali (lingua e tema sul profilo)', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('cambio lingua: subito applicata e salvata sul profilo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    const row = page.getByRole('button', { name: /^Lingua \/ Language/ });
    await expect(row).toContainText('Italiano');
    await row.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('radio')).toHaveCount(2);
    await sheet.getByRole('radio', { name: /English/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: /^Language \/ Lingua/ })).toContainText('English');
    await waitForDoc('profiles/p-1', (d) => d?.locale === 'en');

    // e si torna all'italiano
    await page.getByRole('button', { name: /^Language \/ Lingua/ }).click();
    await page.getByRole('dialog').getByRole('radio', { name: /Italiano/ }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await waitForDoc('profiles/p-1', (d) => d?.locale === 'it');
  });

  test('cambio tema: salvato anche sul profilo', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: /^Tema/ }).click();
    await page.getByRole('dialog').getByRole('radio', { name: /Scuro/ }).click();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await waitForDoc('profiles/p-1', (d) => d?.theme === 'dark');
  });

  test('nuovo dispositivo: lingua e tema del profilo si applicano da soli all’accesso', async ({ page }) => {
    await db.doc('profiles/p-1').update({ locale: 'en', theme: 'dark' });
    // dispositivo "pulito": tema di sistema chiaro, nessuna scelta salvata nel browser
    await page.emulateMedia({ colorScheme: 'light' });
    await loginAsAdmin(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(await page.evaluate(() => localStorage.getItem('cc_locale'))).toBe('en');
  });
});
