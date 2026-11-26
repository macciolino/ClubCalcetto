import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (npm run test:e2e): the REAL app (next dev on port 3100) connected to the LOCAL Firebase
 * emulators of the fake project "demo-clubcalcetto" — production is never touched. Each test seeds its own fake data.
 * Uses the emulator ports of firebase.json (8080 Firestore, 9099 Auth): stop `npm run dev:emulators` first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    ...devices['Pixel 7'],
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx firebase emulators:exec --only auth,firestore --project demo-clubcalcetto "npx next dev -p 3100"',
    url: 'http://localhost:3100/login',
    env: { NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true', PUBLIC_LEAGUES_CACHE_MS: '0' },
    timeout: 300_000,
    // `npm run test:e2e:server` keeps this same server running; `npm run test:e2e:fast` reuses it (E2E_REUSE_SERVER=1)
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
