'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Saved choice on the device: 'system' | 'light' | 'dark' (next-themes, localStorage). */
export const THEME_STORAGE_KEY = 'cc_theme';

/**
 * Light / Dark theme (next-themes): the `dark` or `light` class on <html>, chosen before the first paint
 * (no flash). Default = the system setting.
 *
 * TEMPORARY (until the components are converted to the semantic tokens, Step 3 · Block 1):
 * `enableColorScheme` is off and globals.css keeps `color-scheme: dark`, so native controls (select, date and
 * time pickers, scrollbars) stay dark like the rest of the app even for people whose system is in light mode.
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
      enableColorScheme={false}
    >
      {children}
    </NextThemesProvider>
  );
}
