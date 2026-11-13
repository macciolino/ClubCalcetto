import { expect, test } from '@playwright/test';
import { db, loginAsAdmin, seedMatchDay } from './seed';

/** Login (language from the device) and Profile (language from the profile). */
test.describe('Login e Profilo in italiano e in inglese', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
  });

  test('login in inglese quando il dispositivo è in inglese', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('cc_locale', 'en'));
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back on the pitch', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await page.getByRole('tab', { name: 'Sign up' }).click();
    await expect(page.getByLabel('First name')).toBeVisible();
    await page.getByRole('button', { name: 'Sign up', exact: true }).last().click();
    await expect(page.getByText('First name is required.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Password requirements' })).toContainText('At least 8 characters');
  });

  test('profilo in italiano', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profilo', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Le Mie Statistiche' })).toBeVisible();
  });

  test('profilo in inglese', async ({ page }) => {
    await db.doc('profiles/p-1').update({ locale: 'en' });
    await loginAsAdmin(page);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'My stats' })).toBeVisible();
    await expect(page.getByRole('combobox')).toContainText('Winger');
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
  });
});
