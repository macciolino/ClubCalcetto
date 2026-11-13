'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/context/AuthContext';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { isLocale } from '@/i18n/locale';
import { toThemeChoice } from './ThemeSetting';

/**
 * When the profile loads (sign-in, another device), the language and theme saved on the profile are applied to this
 * device. Only once per profile and value: a change made here is saved on the profile first, so the two never fight.
 * Profiles without preferences keep the device's own choice (browser language, system theme).
 */
export function PreferencesSync() {
  const { profile } = useAuth();
  const { locale, setLocale } = useLocaleSetting();
  const { theme, setTheme } = useTheme();
  const applied = useRef('');

  useEffect(() => {
    if (!profile?.id) return;
    const key = `${profile.id}:${profile.locale || ''}:${profile.theme || ''}`;
    if (applied.current === key) return;
    applied.current = key;
    if (isLocale(profile.locale) && profile.locale !== locale) setLocale(profile.locale);
    if (profile.theme && toThemeChoice(profile.theme) !== toThemeChoice(theme)) setTheme(toThemeChoice(profile.theme));
    // Solo quando cambiano profilo o preferenze salvate, non a ogni cambio fatto qui
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.locale, profile?.theme]);

  return null;
}
