import type { MetadataRoute } from 'next';

// Makes "Add to Home Screen" open ClubCalcetto as an app (needed on iPhone for web push notifications)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Club Soccer',
    short_name: 'Club Soccer',
    description: 'Presenze, squadre bilanciate e statistiche del calcetto.',
    start_url: '/presenze',
    scope: '/',
    display: 'standalone',
    background_color: '#0B0F19',
    theme_color: '#0B0F19',
    lang: 'it',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
