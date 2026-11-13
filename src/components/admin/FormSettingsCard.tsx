'use client';

import React, { useState } from 'react';
import { saveAppSettingsDoc } from '@/lib/firebase/firestoreService';
import { useFormSettings } from '@/lib/hooks/useForms';
import {
  FORM_GOALS_MIN,
  FORM_PENALTY_SAVE_POINTS,
  FORM_PENALTY_SAVE_MAX,
  FORM_GOALS_POINTS,
  FORM_MATCHES,
  FORM_MAX,
  FORM_MIN_VOTES,
  FORM_MVP_POINTS,
  FORM_VOTE_POINTS,
  FORM_WIN_POINTS,
  FORM_LOSS_POINTS,
} from '@/lib/utils/formUtils';
import { ChevronDown, Flame, Star, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';


/**
 * Impostazioni → Parametri e forma: what raises the players' "Stato forma". Always open; the legend is collapsible.
 * Everything off = only the values in the player's card count.
 */
export function FormSettingsCard({ show = 'form' }: { show?: 'form' | 'keeper' }) {
  const settings = useFormSettings();
  const [saving, setSaving] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const t = useTranslations('formSettings');
  const { locale } = useLocaleSetting();
  const num = (n: number) => (locale === 'en' ? String(Math.abs(n)) : String(Math.abs(n)).replace('.', ','));
  // Valori usati nei testi (punti e soglie decisi in formUtils)
  const v = {
    min: FORM_GOALS_MIN,
    pts: num(FORM_GOALS_POINTS),
    save: num(FORM_PENALTY_SAVE_POINTS),
    max: num(FORM_PENALTY_SAVE_MAX),
    mvp: num(FORM_MVP_POINTS),
    votes: FORM_MIN_VOTES,
    vote: num(FORM_VOTE_POINTS),
    win: num(FORM_WIN_POINTS),
    loss: num(FORM_LOSS_POINTS),
    n: FORM_MATCHES,
  };
  const b = (c: React.ReactNode) => <strong>{c}</strong>;

  const setKeeperMode = async (mode: 'rotation' | 'fixed') => {
    if ((mode === 'fixed') === Boolean(settings.fixedKeeper)) return;
    setSaving(true);
    try {
      await saveAppSettingsDoc({ goalkeeper_mode: mode });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key: 'form_goals' | 'form_mvp' | 'form_results', next: boolean) => {
    setSaving(true);
    try {
      await saveAppSettingsDoc({ [key]: next });
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    {
      key: 'form_goals' as const,
      on: settings.goals,
      label: t('goals'),
      help: settings.fixedKeeper ? t('goalsHelpFixed', v) : t('goalsHelp', v),
      icon: <span className="text-base leading-none">⚽</span>,
    },
    {
      key: 'form_mvp' as const,
      on: settings.mvp,
      label: t('mvp'),
      help: t('mvpHelp', v),
      icon: <Star className="h-4 w-4 text-warning" />,
    },
    {
      key: 'form_results' as const,
      on: settings.results,
      label: t('results'),
      help: t('resultsHelp', v),
      icon: <span className="text-base leading-none">🏆</span>,
    },
  ];
  const anyOn = settings.goals || settings.mvp || settings.results;

  if (show === 'keeper') {
    return (
      <>
      {/* Come gioca il club in porta */}
      <section className="bg-card rounded-2xl p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-primary">{t('keeper')}</h3>
          <p className="text-sm text-secondary mt-0.5">{t('keeperHelp')}</p>
        </div>
        <div className="grid grid-cols-2 gap-1 bg-app p-1 rounded-xl text-sm" role="radiogroup" aria-label={t('keeper')}>
          {([
            ['rotation', t('rotation')],
            ['fixed', t('fixed')],
          ] as const).map(([value, label]) => {
            const active = (value === 'fixed') === Boolean(settings.fixedKeeper);
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => setKeeperMode(value)}
                className={`py-2.5 rounded-lg font-bold transition-all ${active ? 'bg-accent text-on-accent' : 'text-secondary hover:text-primary'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-secondary">
          {settings.fixedKeeper
            ? t('fixedNote')
            : t('rotationNote')}
        </p>
      </section>
      </>
    );
  }

  return (
    <div className="bg-card p-4 sm:p-5 rounded-2xl space-y-4">
      <div>
        <h2 className="text-sm font-bold text-primary flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-700 dark:text-orange-400 flex-shrink-0" />
          {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-0.5">
          {anyOn
            ? t('on', v)
            : t('off')}
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-app border border-line">
            <div className="min-w-0">
              <div className="text-sm font-bold text-primary flex items-center gap-2">
                {r.icon} {r.label}
              </div>
              <div className="text-xs text-secondary mt-0.5">{r.help}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={r.on}
              aria-label={t('switchAria', { label: r.label })}
              disabled={saving}
              onClick={() => toggle(r.key, !r.on)}
              className={`relative flex-shrink-0 h-8 w-14 rounded-full transition-colors disabled:opacity-60 ${
                r.on ? 'bg-accent' : 'bg-line-strong'
              }`}
            >
              <span
                className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  r.on ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Legenda di quanto deciso (a tendina) */}
      <div className="rounded-2xl border border-line-strong bg-app/70">
        <button
          type="button"
          onClick={() => setLegendOpen((o) => !o)}
          aria-expanded={legendOpen}
          className="w-full flex items-center justify-between gap-2 p-3 text-left"
        >
          <span className="text-xs font-bold text-primary flex items-center gap-1.5">
            <Info className="h-4 w-4 text-accent-text" /> {t('legend')}
          </span>
          <ChevronDown className={`h-4 w-4 text-secondary transition-transform ${legendOpen ? 'rotate-180' : ''}`} />
        </button>
        {legendOpen && (
          <div className="px-3 pb-3 space-y-3 text-xs text-secondary">
            {(
              [
                ['pointsTitle', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], 'space-y-0.5'],
                ['formTitle', ['s1', 's2', 's3', 's4'], 'space-y-0.5'],
                ['examplesTitle', ['e1', 'e2'], 'space-y-1'],
                ['keeperTitle', ['k1', 'k2'], 'space-y-0.5'],
              ] as const
            ).map(([title, items, gap]) => (
              <div key={title}>
                <p className="font-bold text-primary mb-1">{t(title)}</p>
                <ul className={`list-disc pl-5 ${gap}`}>
                  {items.map((k) => (
                    <li key={k}>{t.rich(k, { ...v, b })}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-secondary">{t('allOff')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
