'use client';

import React, { useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { btn } from '@/components/ui/buttons';
import { notify } from '@/components/ui/Feedback';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { createLeagueRequest } from '@/lib/services/leagueService';
import { FORMAT_INFO, MatchFormat } from '@/lib/utils/matchFormat';
import type { LeagueVisibility } from '@/types/league';

const FORMATS = Object.keys(FORMAT_INFO) as MatchFormat[];
const field = 'w-full rounded-xl border border-line bg-app px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent';

/** Multi-league step 2: name, visibility, usual format / pitch, "I play too". The creator becomes president. */
export function CreateLeagueSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations('league.create');
  const { setActiveLeague } = useActiveLeague();
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<LeagueVisibility>('private');
  const [format, setFormat] = useState<MatchFormat | ''>('');
  const [location, setLocation] = useState('');
  const [asPlayer, setAsPlayer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);

  const valid = name.trim().length >= 2 && name.trim().length <= 48;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    const res = await createLeagueRequest({
      name: name.trim(),
      visibility,
      defaultFormat: format || undefined,
      defaultLocation: location.trim() || undefined,
      joinAsPlayer: asPlayer,
    });
    sending.current = false;
    setBusy(false);
    if ('error' in res) return setError(t(`errors.${res.error}`));
    notify(t('done', { name: name.trim() }));
    setActiveLeague(res.id);
    onClose();
  };

  const radio = (value: LeagueVisibility, label: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={visibility === value}
      onClick={() => setVisibility(value)}
      className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${visibility === value ? 'border-accent bg-accent/10' : 'border-line hover:bg-card-hover'}`}
    >
      <span className="block text-sm font-semibold text-primary">{label}</span>
      <span className="block text-xs text-secondary">{hint}</span>
    </button>
  );

  return (
    <Sheet
      onClose={onClose}
      locked={busy}
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btn.secondary}>
            {t('cancel')}
          </button>
          <button type="submit" form="create-league" disabled={!valid || busy} className={btn.primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {busy ? t('creating') : t('submit')}
          </button>
        </>
      }
    >
      <form id="create-league" onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-secondary">{t('name')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={48} placeholder={t('namePlaceholder')} className={field} autoFocus />
          <span className="block text-xs text-muted">{t('nameHint')}</span>
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-secondary">{t('visibility')}</span>
          <div role="radiogroup" aria-label={t('visibility')} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {radio('private', t('private'), t('privateHint'))}
            {radio('public', t('public'), t('publicHint'))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-secondary">{t('format')}</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as MatchFormat | '')} className={field}>
              <option value="">{t('formatNone')}</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_INFO[f].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-secondary">{t('location')}</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} placeholder={t('locationPlaceholder')} className={field} />
          </label>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 cursor-pointer">
          <input type="checkbox" checked={asPlayer} onChange={(e) => setAsPlayer(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent-primary))]" />
          <span>
            <span className="block text-sm font-semibold text-primary">{t('asPlayer')}</span>
            <span className="block text-xs text-secondary">{t('asPlayerHint')}</span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
