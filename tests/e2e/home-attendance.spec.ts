import { expect, test } from '@playwright/test';
import { db, loginAsAdmin, seedMatchDay } from './seed';

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
