'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Languages } from 'lucide-react';
import { notify } from '@/components/ui/Feedback';
import { useAuth } from '@/lib/context/AuthContext';
import { savePreferences } from '@/lib/firebase/firestoreService';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import type { Locale } from '@/i18n/locale';
import { PreferenceRow, PreferenceSheet } from './PreferenceSheet';

/**
 * Impostazioni → Tuo account → "Lingua / Language": Italiano / English. Applied at once (I18nProvider) and saved on the
 * profile, so it follows the person on every device. Language names are written in their own language.
 */
export function LanguageSetting() {
  const t = useTranslations('language');
  const tTheme = useTranslations('theme');
  const { locale, setLocale } = useLocaleSetting();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  const choose = async (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    setLocale(next);
    try {
      if (profile?.id) await savePreferences(profile.id, { locale: next });
      notify(t('changed', { name: t(next) }));
    } catch {
      notify(tTheme('notSaved'));
    }
  };

  return (
    <>
      <PreferenceRow icon={<Languages className="h-4 w-4" />} label={`${t('label')}${locale === 'it' ? ' / Language' : ' / Lingua'}`} value={t(locale)} onClick={() => setOpen(true)} />
      {open && (
        <PreferenceSheet<Locale>
          title={t('title')}
          subtitle={t('subtitle')}
          value={locale}
          activeLabel={tTheme('active')}
          footnote={tTheme('savedOnDevice')}
          onClose={() => setOpen(false)}
          onChoose={choose}
          options={[
            { id: 'it', label: t('it'), hint: t('itHint'), icon: <span className="text-sm font-bold">IT</span> },
            { id: 'en', label: t('en'), hint: t('enHint'), icon: <span className="text-sm font-bold">EN</span> },
          ]}
        />
      )}
    </>
  );
}
