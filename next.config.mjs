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
    return LEGACY_ROUTES.flatMap(([from, to]) => [
      { source: `/${from}`, destination: `/${to}`, statusCode: 301 },
      { source: `/${from}/:path*`, destination: `/${to}/:path*`, statusCode: 301 },
    ]);
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

// next-intl è usato solo nel browser (src/i18n/I18nProvider.tsx, senza prefissi /it /en negli URL):
// il plugin non serve, e caricherebbe un modulo nativo (@swc/core) bloccato su alcuni PC Windows.
export default nextConfig;
