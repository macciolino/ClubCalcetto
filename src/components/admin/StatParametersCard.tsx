'use client';

import { askConfirm } from '@/components/ui/Feedback';

import React, { useState } from 'react';
import { StatCategory } from '@/types/database';
import { addStatParameter, removeStatParameter } from '@/lib/firebase/firestoreService';
import { NumberInput } from '@/components/NumberInput';
import { CollapsibleCard } from '@/components/CollapsibleCard';
import { Sliders, Plus, Trash2, Loader2, Info, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';

const DEFAULT_PARAMETER_VALUE = 6;

interface StatParametersCardProps {
  categories: StatCategory[];
  onOpenLegend?: () => void;
}

/**
 * Admin → Campi & Parametri: the player parameters (abilities) used for cards, radar and team balancing.
 * The ONLY place where parameters are added or removed.
 */
export function StatParametersCard({ categories, onOpenLegend }: StatParametersCardProps) {
  const [name, setName] = useState('');
  const [defaultValue, setDefaultValue] = useState(DEFAULT_PARAMETER_VALUE);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const t = useTranslations('statParams');
  const labels = usePlayerLabels();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    setError('');
    setMessage('');
    if (!clean) return;
    if (clean.length > 30 || /[.~*/[\]`]/.test(clean)) {
      setError(t('badName'));
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      setError(t('exists', { name: clean }));
      return;
    }
    if (!(await askConfirm(t('confirmAdd', { name: clean, value: defaultValue })))) return;
    setBusy('add');
    try {
      const updated = await addStatParameter(clean, defaultValue);
      setMessage(
        updated > 0
          ? t('added', { name: clean, count: updated, value: defaultValue })
          : t('addedKept', { name: clean })
      );
      setName('');
      setDefaultValue(DEFAULT_PARAMETER_VALUE);
    } catch (err) {
      console.warn('[Parametri] aggiunta non riuscita:', err);
      setError(t('addFailed'));
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (cat: StatCategory) => {
    setError('');
    setMessage('');
    if (!(await askConfirm(t('confirmRemove', { name: labels.statName(cat.name) })))) return;
    setBusy(cat.id);
    try {
      await removeStatParameter(cat.id);
      setMessage(t('removed', { name: labels.statName(cat.name) }));
    } catch (err) {
      console.warn('[Parametri] rimozione non riuscita:', err);
      setError(t('removeFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <CollapsibleCard
      title={t('title')}
      icon={<Sliders className="h-5 w-5 text-accent-text" />}
      summary={categories.length ? categories.map((c) => labels.statName(c.name)).join(' · ') : t('none')}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <p className="text-xs text-secondary">
          {t('intro')}
        </p>
        {onOpenLegend && (
          <button
            type="button"
            onClick={onOpenLegend}
            className="self-start flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold rounded-xl text-xs border border-indigo-500/30"
          >
            <Info className="h-3.5 w-3.5" /> {t('whatTheyMeasure')}
          </button>
        )}
      </div>

      {/* Legenda: cosa succede quando aggiungi o togli */}
      <div className="rounded-2xl border border-line-strong bg-app/70 p-3 sm:p-4 space-y-1.5 text-xs text-secondary">
        <p className="font-bold text-primary flex items-center gap-1.5">
          <Info className="h-4 w-4 text-accent-text" /> {t('howItWorks')}
        </p>
        <ul className="list-disc pl-5 space-y-1">
          {(['h1', 'h2', 'h3'] as const).map((k) => (
            <li key={k}>{t.rich(k, { b: (c) => <strong>{c}</strong> })}</li>
          ))}
        </ul>
      </div>

      {/* Elenco parametri */}
      {categories.length === 0 ? (
        <p className="text-sm text-warning">{t('noneAddOne')}</p>
      ) : (
        <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2">
          {categories.map((cat) => (
            <li
              key={cat.id}
              className="flex items-center gap-2 bg-app border border-line rounded-2xl pl-3 pr-1 py-1 min-h-[48px]"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-primary truncate">{labels.statName(cat.name)}</div>
                <div className="text-[11px] text-muted">{t('defaultValue', { value: cat.default_value ?? 6 })}</div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(cat)}
                disabled={busy !== null}
                aria-label={t('removeAria', { name: labels.statName(cat.name) })}
                className="h-11 w-11 flex items-center justify-center rounded-xl text-muted hover:text-danger hover:bg-rose-500/10 disabled:opacity-40"
              >
                {busy === cat.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aggiunta */}
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1 min-w-0">
          <span className="sr-only">{t('newNameAria')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('newNamePh')}
            maxLength={30}
            className="w-full px-3.5 py-3 bg-app border border-line-strong rounded-xl text-primary text-sm focus:outline-none focus:border-accent"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 bg-app px-3 rounded-xl border border-line-strong flex-1 sm:flex-none">
            <span className="text-xs text-secondary whitespace-nowrap">{t('initialValue')}</span>
            <NumberInput
              min={1}
              max={10}
              value={defaultValue}
              onValueChange={setDefaultValue}
              className="w-12 py-3 bg-transparent text-primary font-mono text-sm text-center focus:outline-none font-bold"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null || !name.trim()}
            className="flex items-center justify-center gap-1.5 px-5 py-3 bg-accent hover:bg-accent/90 text-on-accent font-semibold rounded-xl text-sm disabled:bg-card-hover disabled:text-muted"
          >
            {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('add')}
          </button>
        </div>
      </form>

      {message && (
        <p className="text-xs text-accent-text flex items-start gap-1.5">
          <Check className="h-4 w-4 flex-shrink-0" /> {message}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </CollapsibleCard>
  );
}
