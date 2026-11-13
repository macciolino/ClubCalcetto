import { expect, test } from '@playwright/test';
import { loginAsAdmin, seedMatchDay } from './seed';

/** Impostazioni → Tuo account → Tema: System / Light / Dark, applied at once and remembered on the device. */
test.describe('Tema (Impostazioni)', () => {
  test.beforeEach(async ({ page }) => {
    await seedMatchDay();
    await loginAsAdmin(page);
    await page.goto('/settings');
  });

  test('scelta Chiaro / Scuro / Sistema: classe su <html>, valore nella riga, memoria sul dispositivo', async ({ page }) => {
    const html = page.locator('html');
    const row = page.getByRole('button', { name: /^Tema/ });
    // Playwright simula un sistema in tema chiaro: con "Sistema" la classe è "light"
    await expect(row).toContainText('Sistema');
    await expect(html).toHaveClass(/\blight\b/);

    await row.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('radio')).toHaveCount(3);
    await sheet.getByRole('radio', { name: /Scuro/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(row).toContainText('Scuro');
    expect(await page.evaluate(() => localStorage.getItem('cc_theme'))).toBe('dark');

    // resta dopo un ricaricamento
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);

    await page.getByRole('button', { name: /^Tema/ }).click();
    await page.getByRole('dialog').getByRole('radio', { name: /Chiaro/ }).click();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);

    await page.getByRole('button', { name: /^Tema/ }).click();
    const radios = page.getByRole('dialog').getByRole('radio');
    await expect(radios.filter({ hasText: 'Chiaro' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('dialog').getByRole('radio', { name: /Sistema/ }).click();
    await expect(page.getByRole('button', { name: /^Tema/ })).toContainText('Sistema');
    expect(await page.evaluate(() => localStorage.getItem('cc_theme'))).toBe('system');
  });

  test('le opzioni sono una sotto l’altra (mai affiancate) sul telefono', async ({ page }) => {
    await page.getByRole('button', { name: /^Tema/ }).click();
    await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(3);
    const boxes = await page.getByRole('dialog').getByRole('radio').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(boxes[0]).toBeLessThan(boxes[1]);
    expect(boxes[1]).toBeLessThan(boxes[2]);
  });
});
