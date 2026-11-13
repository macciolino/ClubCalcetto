'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { notify } from '@/components/ui/Feedback';
import { useAuth } from '@/lib/context/AuthContext';
import { savePreferences } from '@/lib/firebase/firestoreService';
import { PreferenceRow, PreferenceSheet } from './PreferenceSheet';

export type ThemeChoice = 'system' | 'light' | 'dark';

/** next-themes can hold an unknown value (old storage): anything else counts as "system". */
export const toThemeChoice = (v: string | undefined | null): ThemeChoice => (v === 'light' || v === 'dark' ? v : 'system');

/**
 * Impostazioni → Tuo account → "Tema": System / Light / Dark. Applied at once on this device (next-themes)
 * and saved on the profile, so it follows the person on every device (see PreferencesSync).
 */
export function ThemeSetting() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  // next-themes conosce il tema solo nel browser: prima mostriamo la riga senza valore
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = toThemeChoice(theme);

  const choose = async (choice: ThemeChoice) => {
    setOpen(false);
    if (choice === current) return;
    setTheme(choice);
    try {
      if (profile?.id) await savePreferences(profile.id, { theme: choice });
      notify(t('changed', { name: t(choice) }));
    } catch {
      notify(t('notSaved'));
    }
  };

  return (
    <>
      <PreferenceRow icon={<Palette className="h-4 w-4" />} label={t('label')} value={mounted ? t(current) : undefined} onClick={() => setOpen(true)} />
      {open && (
        <PreferenceSheet<ThemeChoice>
          title={t('title')}
          subtitle={t('subtitle')}
          value={current}
          activeLabel={t('active')}
          footnote={t('savedOnDevice')}
          onClose={() => setOpen(false)}
          onChoose={choose}
          options={[
            { id: 'system', label: t('system'), hint: t('systemHint'), icon: <Monitor className="h-5 w-5" /> },
            { id: 'light', label: t('light'), hint: t('lightHint'), icon: <Sun className="h-5 w-5" /> },
            { id: 'dark', label: t('dark'), hint: t('darkHint'), icon: <Moon className="h-5 w-5" /> },
          ]}
        />
      )}
    </>
  );
}
