/**
 * Generates the icons:
 *  - app icons (home screen, browser tab, manifest) from the ball logo  assets/logo-header-source.png
 *  - notification image from the logo with the bell                     assets/logo-source.png
 *  - Android status-bar badge: simple ball silhouette
 * Usage: node scripts/make-icons.mjs
 */
import sharp from 'sharp';

const SRC = 'assets/logo-header-source.png'; // app: ball only
const SRC_NOTIFICATION = 'assets/logo-source.png'; // notifications: logo with the bell
const OUT = 'public/icons';
const BG = { r: 2, g: 6, b: 23, alpha: 1 }; // #020617, app background

// Transparent icons (notification large icon, Android home screen, browser tab)
for (const size of [512, 192, 96]) {
  await sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${OUT}/icon-${size}.png`);
}

// Image shown inside the notifications: logo with the bell
await sharp(SRC_NOTIFICATION).resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${OUT}/notification-192.png`);

// iPhone home screen: no transparency allowed, so dark background with a small margin
const inner = Math.round(180 * 0.86);
await sharp({ create: { width: 180, height: 180, channels: 4, background: BG } })
  .composite([{ input: await sharp(SRC).resize(inner, inner).png().toBuffer(), gravity: 'center' }])
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toFile(`${OUT}/apple-icon-180.png`);

// "maskable" Android icon (system may crop it to a circle/squircle): logo inside the safe zone
const safe = Math.round(512 * 0.72);
await sharp({ create: { width: 512, height: 512, channels: 4, background: BG } })
  .composite([{ input: await sharp(SRC).resize(safe, safe).png().toBuffer(), gravity: 'center' }])
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toFile(`${OUT}/icon-maskable-512.png`);

// Android status-bar badge: Android only uses the SHAPE (transparency), drawn in white.
// The full logo would become a white blob, so the badge is a simple football silhouette.
const pent = (cx, cy, r, rot = -90) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = ((rot + i * 72) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
const outer = [0, 1, 2, 3, 4].map((i) => {
  const a = ((-90 + i * 72) * Math.PI) / 180;
  return pent(48 + 33 * Math.cos(a), 48 + 33 * Math.sin(a), 11, -90 + i * 72 + 180);
});
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs><mask id="m"><rect width="96" height="96" fill="white"/>
    <polygon points="${pent(48, 48, 14)}" fill="black"/>
    ${outer.map((p) => `<polygon points="${p}" fill="black"/>`).join('')}
  </mask></defs>
  <circle cx="48" cy="48" r="44" fill="white" mask="url(#m)"/>
</svg>`;
await sharp(Buffer.from(badgeSvg)).png({ compressionLevel: 9 }).toFile(`${OUT}/badge-96.png`);

console.log('Icone create in', OUT);
