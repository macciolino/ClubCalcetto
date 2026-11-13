import { expect, test } from '@playwright/test';
import { db, loginAsAdmin, seedMatchDay } from './seed';

/** Impostazioni in English: overview, admin sections, account and the shared confirm dialog. */
test.describe('Impostazioni in inglese', () => {
  test.beforeEach(async () => {
    await seedMatchDay();
    await db.doc('profiles/p-1').update({ locale: 'en' });
  });

  test('panoramica e sezioni admin tradotte', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    for (const group of ['Your account', 'Match management', 'Club', 'Access']) {
      await expect(page.getByRole('region', { name: group })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: /Match of the week/ })).toBeVisible();

    await page.goto('/settings?sezione=regole');
    await expect(page.getByRole('heading', { name: 'Game rules' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Withdrawal lock' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Goalkeeper' })).toContainText('Rotating');

    await page.goto('/settings?sezione=parametri');
    await expect(page.getByRole('heading', { name: "Players' current form" })).toBeVisible();
    await page.getByRole('button', { name: /Legend: how current form is calculated/ }).click();
    await expect(page.getByText('Points of each match')).toBeVisible();

    await page.goto('/settings?sezione=campi');
    await expect(page.getByRole('heading', { name: 'Pitches', exact: true })).toBeVisible();
    await expect(page.getByText('Default', { exact: true })).toBeVisible();

    await page.goto('/settings?sezione=accessi');
    await expect(page.getByRole('heading', { name: 'Admins', exact: true })).toBeVisible();
    await expect(page.getByText('No deactivated accounts.')).toBeVisible();
  });

  test('account e finestra di conferma tradotti', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings?sezione=account');
    await page.getByRole('button', { name: 'Sign out of all devices' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText("Sign out of all devices? You'll have to sign in again everywhere.");
    await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto('/settings?sezione=notifiche');
    await expect(page.getByText('We let you know when:')).toBeVisible();
  });
});
