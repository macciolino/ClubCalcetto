/**
 * READ-ONLY dump of the Firestore STRUCTURE: collections, subcollections, document id patterns, field names, types
 * and how many documents have each field. Values are NEVER written (no names, emails, scores...).
 *
 * - Emulator:   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/dump-firestore-schema.mjs
 * - Production: node scripts/dump-firestore-schema.mjs --key C:\path\to\service-account.json
 *   (Firebase console → Project settings → Service accounts → Generate new private key; keep the file OUTSIDE the repo)
 *
 * Output: ./backups/schema-<timestamp>.json and .md (git-ignored). Uses only reads (1 read per document).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const keyArg = process.argv.indexOf('--key');
const keyPath = keyArg > 0 ? process.argv[keyArg + 1] : process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
let source;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-clubcalcetto' });
  source = 'emulator';
} else if (keyPath) {
  const sa = JSON.parse(readFileSync(keyPath, 'utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id });
  source = 'production';
} else {
  console.error('Usa --key <service-account.json> per la produzione oppure FIRESTORE_EMULATOR_HOST per l’emulatore.');
  process.exit(1);
}
const db = getFirestore();

// Keys that are ids (player ids, uids, dates) are collapsed into "{id}" so the dump stays generic and anonymous
const looksLikeId = (k) => /\d/.test(k) || /^[A-Za-z0-9_-]{20,}$/.test(k) || k.includes('@');
const idPattern = (id) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(id)) return 'YYYY-MM-DD';
  if (/^\d{4}-\d{2}-\d{2}_/.test(id)) return 'YYYY-MM-DD_{id}';
  if (/^p-\d+$/.test(id)) return 'p-N';
  if (/^[A-Za-z0-9]{28}$/.test(id)) return '{uid}';
  if (/^[A-Za-z0-9]{20}$/.test(id)) return '{autoId}';
  return looksLikeId(id) ? '{id}' : id;
};
const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v && typeof v.toDate === 'function') return 'timestamp';
  if (v && typeof v.latitude === 'number' && typeof v.longitude === 'number') return 'geopoint';
  if (v && typeof v.path === 'string' && typeof v.id === 'string') return 'reference';
  return typeof v === 'object' ? 'map' : typeof v;
};

function addFields(fields, data, prefix = '', depth = 0) {
  const keys = Object.keys(data);
  const dynamic = keys.length > 12 || (keys.length > 0 && keys.every(looksLikeId));
  for (const k of keys) {
    const path = prefix + (dynamic ? '{id}' : k);
    const v = data[k];
    const f = (fields[path] ||= { types: {}, docs: 0 });
    const t = typeOf(v);
    f.types[t] = (f.types[t] || 0) + 1;
    if (t === 'map' && depth < 4) addFields(fields, v, `${path}.`, depth + 1);
    if (t === 'array') {
      for (const item of v.slice(0, 50)) {
        const it = typeOf(item);
        const af = (fields[`${path}[]`] ||= { types: {}, docs: 0 });
        af.types[it] = (af.types[it] || 0) + 1;
        if (it === 'map' && depth < 4) addFields(fields, item, `${path}[].`, depth + 1);
      }
    }
  }
}

async function dumpCollection(ref, out) {
  const snap = await ref.get();
  const node = { documents: snap.size, idPatterns: {}, fields: {}, subcollections: {} };
  for (const doc of snap.docs) {
    const p = idPattern(doc.id);
    node.idPatterns[p] = (node.idPatterns[p] || 0) + 1;
    addFields(node.fields, doc.data());
    const data = doc.data();
    const dynamic = Object.keys(data).length > 12 || Object.keys(data).every(looksLikeId);
    for (const top of new Set(Object.keys(data).map((k) => (dynamic ? '{id}' : k)))) node.fields[top].docs++;
    for (const sub of await doc.ref.listCollections()) {
      const name = sub.id;
      const child = await dumpCollection(sub, {});
      child.parents = 0;
      const merged = (node.subcollections[name] ||= { parents: 0, documents: 0, idPatterns: {}, fields: {}, subcollections: {} });
      merged.parents++;
      mergeNode(merged, child);
    }
  }
  return Object.assign(out, node);
}

function mergeNode(into, from) {
  into.documents += from.documents;
  for (const [p, n] of Object.entries(from.idPatterns)) into.idPatterns[p] = (into.idPatterns[p] || 0) + n;
  for (const [k, f] of Object.entries(from.fields)) {
    const t = (into.fields[k] ||= { types: {}, docs: 0 });
    t.docs += f.docs;
    for (const [ty, n] of Object.entries(f.types)) t.types[ty] = (t.types[ty] || 0) + n;
  }
  for (const [name, sub] of Object.entries(from.subcollections)) {
    const t = (into.subcollections[name] ||= { parents: 0, documents: 0, idPatterns: {}, fields: {}, subcollections: {} });
    t.parents += sub.parents;
    mergeNode(t, sub);
  }
}

const schema = { source, exported_at: new Date().toISOString(), collections: {} };
for (const col of await db.listCollections()) {
  schema.collections[col.id] = await dumpCollection(col, {});
  console.log(`✓ ${col.id}: ${schema.collections[col.id].documents} documenti`);
}

// Markdown tree, easy to read
const lines = [`# Struttura Firestore (${source}) — ${schema.exported_at}`, '', 'Solo nomi dei campi, tipi e conteggi: nessun valore.', ''];
const fmtTypes = (t) => Object.keys(t).join(' | ');
function md(name, node, depth, path) {
  const pad = '  '.repeat(depth);
  const ids = Object.entries(node.idPatterns).map(([p, n]) => (n > 1 ? `${p} ×${n}` : p)).join(', ');
  lines.push(`${pad}- **${path}${name}/** — ${node.documents} doc${node.parents ? ` (in ${node.parents} documenti padre)` : ''}${ids ? ` · id: ${ids.length > 160 ? ids.slice(0, 160) + '…' : ids}` : ''}`);
  for (const [k, f] of Object.entries(node.fields).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${pad}  - \`${k}\`: ${fmtTypes(f.types)}${f.docs && f.docs < node.documents ? ` (in ${f.docs}/${node.documents})` : ''}`);
  }
  for (const [sub, child] of Object.entries(node.subcollections)) md(sub, child, depth + 1, `${path}${name}/{id}/`);
}
for (const [name, node] of Object.entries(schema.collections)) md(name, node, 0, '');

mkdirSync('backups', { recursive: true });
const stamp = schema.exported_at.replace(/[:.]/g, '-');
writeFileSync(join('backups', `schema-${source}-${stamp}.json`), JSON.stringify(schema, null, 2));
writeFileSync(join('backups', `schema-${source}-${stamp}.md`), lines.join('\n') + '\n');
console.log(`\nSalvato in backups/schema-${source}-${stamp}.md e .json`);
