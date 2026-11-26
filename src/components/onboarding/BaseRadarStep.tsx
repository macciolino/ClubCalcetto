'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Info, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { notify } from '@/components/ui/Feedback';
import { btn } from '@/components/ui/buttons';
import { StatRatingFields, ovrOf } from '@/components/StatRatingFields';
import { saveBaseRadar } from '@/lib/services/onboardingService';
import { BASE_RADAR_CATEGORIES, defaultBaseRadar } from '@/lib/utils/baseRadar';

/**
 * First step of a NEW account, before any league or the board: the Radar Base (self-assessment). Every attribute starts
 * at 6, so it can be adjusted or confirmed at once with "Salva e prosegui". Saved on the global profile; it is the
 * starting point of every league card, where the values stay unconfirmed until a president / collaborator approves them.
 */
export function BaseRadarStep() {
  const t = useTranslations('onboarding.radar');
  const { refreshProfile } = useAuth();
  const [values, setValues] = useState<Record<string, number>>(() => defaultBaseRadar());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await saveBaseRadar(values);
    if (!ok) {
      notify(t('failed'), 'error');
      setSaving(false);
      return;
    }
    await refreshProfile(); // the step is done: the page the person was going to (league, invite, board) opens
  };

  return (
    <section aria-labelledby="radar-title" className="mx-auto w-full max-w-xl rounded-2xl border border-line bg-card p-5 sm:p-7 space-y-5">
      <header className="space-y-1.5">
        <h1 id="radar-title" className="text-2xl font-black text-primary">
          {t('title')}
        </h1>
        <p className="text-sm text-secondary">{t('subtitle')}</p>
      </header>

      <div className="flex items-center justify-between rounded-xl border border-line bg-app/60 px-4 py-3">
        <span className="text-sm text-secondary">{t('startOvr')}</span>
        <span className="text-2xl font-bold text-primary tabular-nums">{Math.round(ovrOf(values) * 10)}</span>
      </div>

      <div role="note" className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <Info className="h-5 w-5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5 text-sm">
          <p className="font-semibold text-warning">{t('noticeTitle')}</p>
          <p className="text-secondary leading-relaxed">{t('notice')}</p>
        </div>
      </div>

      <p className="text-xs text-muted">{t('hint')}</p>

      <StatRatingFields categories={BASE_RADAR_CATEGORIES} values={values} onChange={setValues} showHelp disabled={saving} />

      <button type="button" onClick={save} disabled={saving} className={btn.primary}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
        {t('save')}
      </button>
    </section>
  );
}
