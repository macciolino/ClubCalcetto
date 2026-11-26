'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Sheet, sheetBtn } from '@/components/ui/Sheet';
import { notify } from '@/components/ui/Feedback';
import { StatRatingFields, ovrOf } from '@/components/StatRatingFields';
import { rateNoticeApplicant } from '@/lib/services/matchNoticeService';
import { BASE_RADAR_CATEGORIES, defaultBaseRadar } from '@/lib/utils/baseRadar';
import type { MatchNotice } from '@/types/matchNotice';

/**
 * Quick, OPTIONAL rating of an external player after the match (managers, or whoever closed the report).
 * It goes in the report of that match and in the person's global radar; their cards in the leagues they belong to
 * never change. docs/ARCHITECTURE.md §3.5.
 */
export function ExternalRatingSheet({
  notice,
  person,
  initial,
  onClose,
}: {
  notice: MatchNotice;
  person: { profileId: string; name: string };
  /** The rating already given (editing it) */
  initial?: Record<string, number>;
  onClose: () => void;
}) {
  const t = useTranslations('board.rating');
  const tb = useTranslations('board');
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...defaultBaseRadar(), ...(initial || {}) }));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await rateNoticeApplicant(notice.id, person.profileId, values);
    setSaving(false);
    if (res !== 'ok') return notify(tb(`errors.${res}`), 'error');
    notify(t('saved', { name: person.name }), 'success');
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title={t('title', { name: person.name })}
      subtitle={t('subtitle', { name: person.name })}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={sheetBtn.secondary}>
            {t('later')}
          </button>
          <button type="button" onClick={save} disabled={saving} className={sheetBtn.primary}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {t('save')}
          </button>
        </>
      }
    >
      <div className="flex items-center justify-between rounded-xl border border-line bg-app/60 px-4 py-3">
        <span className="text-sm text-secondary">{t('ovr')}</span>
        <span className="text-2xl font-bold text-primary tabular-nums">{Math.round(ovrOf(values) * 10)}</span>
      </div>
      <p className="text-xs text-muted">{t('hint')}</p>
      <StatRatingFields categories={BASE_RADAR_CATEGORIES} values={values} onChange={setValues} disabled={saving} />
    </Sheet>
  );
}
