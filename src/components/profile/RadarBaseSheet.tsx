'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Info, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { notify } from '@/components/ui/Feedback';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { surface } from '@/components/ui/surfaces';
import { StatRatingFields, ovrOf } from '@/components/StatRatingFields';
import { saveBaseRadar } from '@/lib/services/onboardingService';
import { BASE_RADAR_CATEGORIES, cleanBaseRadar, defaultBaseRadar } from '@/lib/utils/baseRadar';

/**
 * Edit the Radar Base (the person's own values on the PLATFORM), from the Profile, with or without a league. They are the
 * starting point of every NEW league card and the level used when the person plays a single match as a guest. Changing
 * them never touches the values a league already holds for the person (docs/ARCHITECTURE.md §3.1, points 8 and 9).
 */
export function RadarBaseSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations('radarBase');
  const { profile, refreshProfile } = useAuth();
  const saved = useMemo(() => cleanBaseRadar(profile?.baseRadar), [profile?.baseRadar]);
  const [values, setValues] = useState<Record<string, number>>(() => saved || defaultBaseRadar());
  const [busy, setBusy] = useState(false);
  const changed = !saved || Object.keys(values).some((k) => values[k] !== saved[k]);

  const save = async () => {
    setBusy(true);
    const ok = await saveBaseRadar(values);
    setBusy(false);
    if (!ok) return notify(t('failed'), 'error');
    await refreshProfile();
    notify(t('saved'), 'success');
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title={t('title')}
      subtitle={saved ? t('subtitle') : t('subtitleNone')}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={sheetBtn.secondary}>
            {t('cancel')}
          </button>
          <button type="button" onClick={save} disabled={busy || !changed} className={sheetBtn.primary}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {t('save')}
          </button>
        </>
      }
    >
      <div className={`${surface.inset} flex items-center justify-between px-4 py-3`}>
        <span className="text-sm text-secondary">{t('ovr')}</span>
        <span className="text-2xl font-bold text-primary tabular-nums">{Math.round(ovrOf(values) * 10)}</span>
      </div>
      <div role="note" className={`${surface.inset} flex gap-3 px-3.5 py-3 text-xs text-secondary`}>
        <Info className="h-4 w-4 shrink-0 text-muted mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">{t('hint')}</p>
      </div>
      <StatRatingFields categories={BASE_RADAR_CATEGORIES} values={values} onChange={setValues} showHelp disabled={busy} />
    </Sheet>
  );
}
