/**
 * Old Italian addresses → canonical English routes (301, query string kept: ?date=…, ?sezione=…, ?da=notifica).
 * They keep working: links shared on WhatsApp, notifications already on phones, apps installed with the old start page.
 */
const LEGACY_ROUTES = [
  ['presenze', 'attendance'],
  ['giocatori', 'players'],
  ['squadre', 'teams'],
  ['impostazioni', 'settings'],
  ['storico', 'history'],
  ['profilo', 'profile'],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      ...LEGACY_ROUTES.flatMap(([from, to]) => [
        { source: `/${from}`, destination: `/${to}`, statusCode: 301 },
        { source: `/${from}/:path*`, destination: `/${to}/:path*`, statusCode: 301 },
      ]),
      // "Il mio account" (2026-11-27) è stato diviso in Profilo e Impostazioni, aperti anche senza lega
      { source: '/account', destination: '/profile', permanent: false },
      // Le leghe pubbliche si aprono in una finestra (Home e ingresso), non in una pagina
      { source: '/leagues', destination: '/', permanent: false },
    ];
  },
  // No `images.remotePatterns`: next/image is not used (photos are plain <img>), so the optimizer must not fetch
  // images from any site (C5: it turned the app into a free image proxy consuming the Vercel Hobby quota).
};

// next-intl è usato solo nel browser (src/i18n/I18nProvider.tsx, senza prefissi /it /en negli URL):
// il plugin non serve, e caricherebbe un modulo nativo (@swc/core) bloccato su alcuni PC Windows.
export default nextConfig;
