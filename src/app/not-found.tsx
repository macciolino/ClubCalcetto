'use client'; // the language is chosen in the browser (I18nProvider), so this page is a client component

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ErrorState';

/** C9 — unknown address: the app's own 404 page. */
export default function NotFound() {
  const t = useTranslations('errorPage');
  return <ErrorState kind="not-found" title={t('notFoundTitle')} body={t('notFoundBody')} homeLabel={t('home')} />;
}
