'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ErrorState';

/** C9 — a crash inside a page: the app's own message with "Riprova" (navbar and providers stay). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('errorPage');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorState kind="error" title={t('title')} body={t('body')} retryLabel={t('retry')} homeLabel={t('home')} onRetry={retry} />;
}
