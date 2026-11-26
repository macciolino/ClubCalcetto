/**
 * Starts the end-to-end test server ONCE and keeps it running: the Firebase emulators (auth + Firestore, fake project
 * "demo-clubcalcetto") and the app (next dev, port 3100). Leave it open in a terminal and run `npm run test:e2e:fast` as
 * many times as needed: the tests reuse it instead of starting everything again (15–20 seconds saved on every run,
 * and the pages are already compiled). Stop it with Ctrl+C. Same environment as the server `playwright test` starts
 * by itself (see playwright.config.ts). Usage: npm run test:e2e:server
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(
  'npx firebase emulators:exec --only auth,firestore --project demo-clubcalcetto "npx next dev -p 3100"',
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true', PUBLIC_LEAGUES_CACHE_MS: '0' },
  }
);
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
