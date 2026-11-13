// ESLint (flat config) con le regole ufficiali di Next.js: React, hook, accessibilità di base, TypeScript.
// Uso: npm run lint
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Regole nuove di React 19 / tipi: segnalate come avvisi (debito tecnico da ridurre piano piano), non come errori.
      // - setState dentro useEffect: nel progetto è usato per sincronizzare con Firestore e localStorage (funziona).
      // - any: tipi da precisare.
      'react-hooks/set-state-in-effect': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // Logout e sessione scaduta ricaricano apposta la pagina intera (azzera tutto lo stato)
      '@next/next/no-location-assign-relative-destination': 'off',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'backups/**', 'scripts/**', 'next-env.d.ts'],
  },
];

export default config;
