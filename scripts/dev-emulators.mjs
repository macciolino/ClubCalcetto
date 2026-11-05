/**
 * Starts the LOCAL test environment:
 *   - Firebase Auth + Firestore emulators (fake project "demo-clubcalcetto")
 *   - Next.js dev server on http://localhost:3001 connected to the emulators
 *
 * Port 3001 (not 3000) keeps the browser localStorage separate from any
 * session that used real production data on localhost:3000.
 *
 * Emulator data is kept in ./emulator-data (git-ignored) between runs.
 * Usage: npm run dev:emulators   (then, in a 2nd terminal: npm run seed:emulators)
 */
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
};

const cmd =
  'npx firebase emulators:exec --only auth,firestore --project demo-clubcalcetto ' +
  '--import=./emulator-data --export-on-exit=./emulator-data --ui "npx next dev -p 3001"';

const child = spawn(cmd, { stdio: 'inherit', shell: true, env });
child.on('exit', (code) => process.exit(code ?? 0));
