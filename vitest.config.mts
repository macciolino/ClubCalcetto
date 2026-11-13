import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest: unit tests (pure business logic) and integration tests (server logic on the LOCAL Firebase emulators).
 *   npm run test:unit         → tests/unit (no network, no Firebase)
 *   npm run test:integration  → tests/integration, started inside `firebase emulators:exec` (fake project demo-clubcalcetto)
 * Playwright end-to-end tests are in tests/e2e (npm run test:e2e), not run by Vitest.
 */

// Windows: lo stesso progetto aperto come "c:\…" e "C:\…" fa caricare Vitest due volte ("reading 'config'").
// Si usa sempre la lettera del disco maiuscola.
const upperDrive = (p: string) => p.replace(/^[a-z]:/, (d) => d.toUpperCase());
const root = upperDrive(import.meta.dirname);

export default defineConfig({
  root,
  resolve: { alias: { '@': path.join(root, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // I test d'integrazione condividono gli emulatori: un file alla volta
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
