/**
 * Server libraries must load the way the Vercel functions load them.
 *
 * Next.js leaves `firebase-admin` OUT of the bundle and the functions load it with require() at run time.
 * The Vercel function runtime refuses require() of ES modules (ERR_REQUIRE_ESM), while a recent local Node.js
 * accepts it — so the app can work on the PC and break online (it happened with firebase-admin 14).
 * Run with:  node --no-experimental-require-module scripts/check-server-modules.cjs   (npm run check:server)
 */
const MODULES = ['firebase-admin/app', 'firebase-admin/auth', 'firebase-admin/firestore', 'firebase-admin/messaging'];

let failed = 0;
for (const name of MODULES) {
  try {
    require(name);
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✘ ${name}: ${String((err && err.code) || '')} ${String((err && err.message) || err).split('\n')[0]}`);
  }
}
if (failed) {
  console.log(`\n${failed} server module(s) do not load like on Vercel: do not publish this dependency version.`);
  process.exit(1);
}
console.log('\nServer modules load like on Vercel.');
