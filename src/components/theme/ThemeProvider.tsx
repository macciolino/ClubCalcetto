'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Saved choice on the device: 'system' | 'light' | 'dark' (next-themes, localStorage). */
export const THEME_STORAGE_KEY = 'cc_theme';

/**
 * Light / Dark theme (next-themes): the `dark` or `light` class on <html>, chosen before the first paint
 * (no flash). Default = the system setting.
 * `color-scheme` follows the theme too, so native controls (select, date and time pickers) match it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
      themes={['light', 'dark']}
    >
      {children}
    </NextThemesProvider>
  );
}
