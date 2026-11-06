import type { MetadataRoute } from 'next';

// Makes "Add to Home Screen" open ClubCalcetto as an app (needed on iPhone for web push notifications)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ClubCalcetto',
    short_name: 'ClubCalcetto',
    description: 'Presenze, squadre bilanciate e statistiche del calcetto.',
    start_url: '/presenze',
    scope: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#020617',
    lang: 'it',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
