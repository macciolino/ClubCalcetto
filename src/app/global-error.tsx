'use client'; // Error boundaries must be Client Components

import './globals.css';
import { useEffect, useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import it from '../../messages/it.json';
import en from '../../messages/en.json';
import { LOCALE_STORAGE_KEY, detectLocale } from '@/i18n/locale';
import { ErrorState } from '@/components/ErrorState';

/**
 * C9 — a crash in the root layout itself: replaces the whole page, so it brings its own <html>/<body>
 * and its own translations (the app providers are not available here).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  // Shown after a crash, in the browser: the language is read once from the device (saved choice → browser)
  const [locale] = useState(() => {
    if (typeof window === 'undefined') return 'it' as const;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return detectLocale({ saved, browser: navigator.languages || [navigator.language] });
  });
  useEffect(() => {
    console.error(error);
  }, [error]);
  const msgs = locale === 'en' ? en : it;
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-app text-primary antialiased px-4">
        <NextIntlClientProvider locale={locale} messages={msgs}>
          <ErrorState
            kind="error"
            title={msgs.errorPage.title}
            body={msgs.errorPage.body}
            retryLabel={msgs.errorPage.retry}
            homeLabel={msgs.errorPage.home}
            onRetry={retry}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
