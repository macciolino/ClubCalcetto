/**
 * Starts Vitest from the project folder with an UPPERCASE drive letter.
 * On Windows a terminal opened as "c:\…" (e.g. VS Code) makes Vitest load twice and every test file fails
 * with "Cannot read properties of undefined (reading 'config')". Usage: node scripts/vitest.mjs run tests/unit
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replace(/^[a-z]:/, (d) => d.toUpperCase());
const bin = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 1));
