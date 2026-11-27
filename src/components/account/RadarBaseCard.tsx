'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Info, Loader2, Radar } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { notify } from '@/components/ui/Feedback';
import { btn } from '@/components/ui/buttons';
import { surface } from '@/components/ui/surfaces';
import { StatRatingFields, ovrOf } from '@/components/StatRatingFields';
import { saveBaseRadar } from '@/lib/services/onboardingService';
import { BASE_RADAR_CATEGORIES, cleanBaseRadar, defaultBaseRadar } from '@/lib/utils/baseRadar';

/**
 * "Il mio Radar Base" (Il mio account): the person's own technical values on the PLATFORM, reachable also without a league.
 * They are the starting point of every NEW league card and the level used when the person plays a single match as a
 * guest from the board. Changing them never touches the values a league already holds for the person: each league keeps
 * its own (docs/ARCHITECTURE.md §3.1, point 8). Saved by the server on the global profile.
 */
export function RadarBaseCard() {
  const t = useTranslations('accountPage.radar');
  const { profile, refreshProfile } = useAuth();
  const saved = useMemo(() => cleanBaseRadar(profile?.baseRadar), [profile?.baseRadar]);
  const [values, setValues] = useState<Record<string, number>>(() => saved || defaultBaseRadar());
  const [busy, setBusy] = useState(false);
  const changed = !saved || Object.keys(values).some((k) => values[k] !== saved[k]);

  const save = async () => {
    setBusy(true);
    const ok = await saveBaseRadar(values);
    if (ok) {
      await refreshProfile();
      notify(t('saved'), 'success');
    } else {
      notify(t('failed'), 'error');
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="radar-base-title" className={`${surface.card} p-4 sm:p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="radar-base-title" className="text-base font-semibold text-primary flex items-center gap-2">
            <Radar className="h-5 w-5 text-accent-text" aria-hidden="true" /> {t('title')}
          </h2>
          <p className="text-sm text-secondary mt-0.5">{saved ? t('subtitle') : t('subtitleNone')}</p>
        </div>
        <span className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-mono font-bold text-warning tabular-nums" aria-label={t('ovr')}>
          OVR {Math.round(ovrOf(values) * 10)}
        </span>
      </div>

      <div role="note" className={`${surface.inset} flex gap-3 px-3.5 py-3 text-xs text-secondary`}>
        <Info className="h-4 w-4 shrink-0 text-muted mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">{t('hint')}</p>
      </div>

      <StatRatingFields categories={BASE_RADAR_CATEGORIES} values={values} onChange={setValues} showHelp disabled={busy} />

      <button type="button" onClick={save} disabled={busy || !changed} className={btn.primary}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
        {saved ? t('save') : t('saveFirst')}
      </button>
    </section>
  );
}
