/**
 * Languages of the app (no /it or /en in the URLs: the language is a per-person setting).
 * Order of choice: the person's saved choice → the browser language (navigator.languages) → Italian.
 */
export const LOCALES = ['it', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'it';

/** Saved on the device (and mirrored in the NEXT_LOCALE cookie for server-side use). */
export const LOCALE_STORAGE_KEY = 'cc_locale';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** "en-GB" → "en", "it-IT" → "it", anything else → null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  const base = String(tag || '').toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/** Pure choice of the language, testable without a browser. */
export function detectLocale(input: { saved?: string | null; browser?: readonly string[] | null }): Locale {
  if (isLocale(input.saved)) return input.saved;
  for (const tag of input.browser || []) {
    const m = matchLocale(tag);
    if (m) return m;
  }
  return DEFAULT_LOCALE;
}
