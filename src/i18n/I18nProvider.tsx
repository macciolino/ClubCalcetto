'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import it from '../../messages/it.json';
import en from '../../messages/en.json';
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_STORAGE_KEY, Locale, detectLocale } from './locale';

const MESSAGES = { it, en } as const;

interface LocaleContextValue {
  locale: Locale;
  /** Changes the language at once (saved on this device; saving it on the profile is done by the caller). */
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: DEFAULT_LOCALE, setLocale: () => undefined });

/** Current language and the function to change it (e.g. the "Lingua / Language" setting). */
export const useLocaleSetting = () => useContext(LocaleContext);

function remember(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* memoria del browser bloccata: vale solo per questa visita */
  }
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/**
 * Language of the app WITHOUT i18n routing (clean URLs, pages stay static): it is chosen in the browser —
 * saved choice → navigator.languages → Italian. The first render is always Italian (same as the server),
 * then it switches if needed, so there is no hydration mismatch.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const detected = detectLocale({ saved, browser: typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [] });
    if (detected !== DEFAULT_LOCALE) setLocaleState(detected);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    remember(next);
    setLocaleState(next);
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Rome">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
