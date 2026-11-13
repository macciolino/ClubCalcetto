'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Check, ChevronRight, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { notify } from '@/components/ui/Feedback';

export type ThemeChoice = 'system' | 'light' | 'dark';
const CHOICES: { id: ThemeChoice; icon: React.ElementType }[] = [
  { id: 'system', icon: Monitor },
  { id: 'light', icon: Sun },
  { id: 'dark', icon: Moon },
];

/** next-themes can hold an unknown value (old storage): anything else counts as "system". */
export const toThemeChoice = (v: string | undefined): ThemeChoice => (v === 'light' || v === 'dark' ? v : 'system');

/**
 * Impostazioni → Tuo account → "Tema": row with the active value; tap → sheet with System / Light / Dark
 * (one option per row, vertical stack; bottom sheet on phone, centred modal on desktop). Saved by next-themes on this device.
 */
export function ThemeSetting() {
  const t = useTranslations('theme');
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  // next-themes conosce il tema solo nel browser: prima mostriamo la riga senza valore
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = toThemeChoice(theme);

  const choose = (choice: ThemeChoice) => {
    if (choice !== current) {
      setTheme(choice);
      notify(t('changed', { name: t(choice) }));
    }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full flex items-center gap-3 px-3.5 py-3 text-sm text-left text-primary hover:bg-card-hover/60 transition-colors"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-card-hover text-accent-text">
          <Palette className="h-4 w-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{t('label')}</span>
          {mounted && <span className="sm:hidden block text-xs text-secondary truncate">{t(current)}</span>}
        </span>
        {mounted && <span className="hidden sm:block text-xs text-secondary text-right">{t(current)}</span>}
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden="true" />
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} title={t('title')} subtitle={t('subtitle')}>
          <div role="radiogroup" aria-label={t('title')} className="space-y-2">
            {CHOICES.map(({ id, icon: Icon }) => {
              const active = id === current;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(id)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                    active ? 'bg-accent/10 ring-2 ring-accent' : 'bg-app/60 hover:bg-card-hover'
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                      active ? 'bg-accent text-on-accent' : 'bg-card-hover text-secondary'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-primary">{t(id)}</span>
                    <span className="block text-xs text-secondary">{t(`${id}Hint`)}</span>
                  </span>
                  {active && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-accent-text">
                      <Check className="h-4 w-4" /> <span className="hidden sm:inline">{t('active')}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">{t('savedOnDevice')}</p>
        </Sheet>
      )}
    </>
  );
}
