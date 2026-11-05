/**
 * READ-ONLY backup of the production Firestore database.
 *
 * - Uses ONLY read operations (getDocs). It never writes, updates or deletes.
 * - Reads Firebase config from .env.local (values are never printed).
 * - Saves a JSON snapshot to ./backups/firestore-<timestamp>.json (git-ignored).
 *
 * Usage:  node scripts/backup-firestore.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Collections used by the app (see src/lib/firebase/firestoreService.ts and src/lib/services/*)
const COLLECTIONS = [
  'profiles',
  'presences',
  'stat_categories',
  'settings',
  'matches',
  'generated_teams',
  'match_payments',
  'sport_fields',
];

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv('.env.local');
const config = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!config.apiKey || !config.projectId) {
  console.error('Missing Firebase config in .env.local');
  process.exit(1);
}

const db = getFirestore(initializeApp(config));
const snapshot = { project_id: config.projectId, exported_at: new Date().toISOString(), collections: {} };

for (const name of COLLECTIONS) {
  try {
    const snap = await getDocs(collection(db, name));
    snapshot.collections[name] = {};
    snap.forEach((d) => {
      snapshot.collections[name][d.id] = d.data();
    });
    console.log(`  ${name}: ${snap.size} documents`);
  } catch (err) {
    console.warn(`  ${name}: READ FAILED (${err.code || err.message})`);
  }
}

mkdirSync('backups', { recursive: true });
const outFile = join('backups', `firestore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(outFile, JSON.stringify(snapshot, null, 2), 'utf8');
console.log(`\nBackup saved to ${outFile}`);
process.exit(0);
