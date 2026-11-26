/**
 * Runs the end-to-end tests against the server already started with `npm run test:e2e:server` (Playwright reuses it).
 * Without that server running, Playwright starts its own as usual. Any argument goes to Playwright, e.g.
 * `npm run test:e2e:fast -- tests/e2e/board.spec.ts -g "rinuncia"`.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_REUSE_SERVER: '1' },
});
child.on('exit', (code) => process.exit(code ?? 1));
