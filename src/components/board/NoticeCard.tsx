'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, MapPin, UserPlus } from 'lucide-react';
import { btn } from '@/components/ui/buttons';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { FORMAT_INFO } from '@/lib/utils/matchFormat';
import { fieldMapsUrl } from '@/lib/utils/matchUtils';
import { subscribeMySpot } from '@/lib/services/matchNoticeService';
import type { MatchNotice } from '@/types/matchNotice';

/** Day and time of the match in Italian time, in the app's language ("sab 28 nov · 20:30"). */
export function noticeWhen(iso: string, locale: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(locale, { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(locale, { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
  const text = `${day} · ${time}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Status shown to managers: a notice closed because every spot was taken reads "Completo". */
export const noticeStatusKey = (n: MatchNotice) => (n.status === 'CLOSED' && n.closedReason === 'full' ? 'FULL' : n.status);

const euro = (n: number, locale: string) =>
  n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });

/** Small facts of a notice as pills: format, role wanted, shirt, quota. Used by the board and the managers' sheet. */
export function NoticeFacts({ notice }: { notice: MatchNotice }) {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const pill = 'rounded-full bg-app px-2.5 py-1 text-xs text-secondary';
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={pill}>{FORMAT_INFO[notice.format]?.label || notice.format}</span>
      <span className={pill}>{t(`roles.${notice.roleNeeded}`)}</span>
      <span className={pill}>{t(`shirts.${notice.shirtColor}`)}</span>
      <span className={pill}>{notice.costPerPlayer > 0 ? t('perHead', { amount: euro(notice.costPerPlayer, locale) }) : t('free')}</span>
    </div>
  );
}

/** One notice on the board, with "Prendi il posto" (or "Hai preso il posto" once taken). */
export function NoticeCard({ notice, profileId, onTake }: { notice: MatchNotice; profileId: string | null; onTake: (n: MatchNotice) => Promise<void> }) {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const [taken, setTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => (profileId ? subscribeMySpot(notice.id, profileId, setTaken) : undefined), [notice.id, profileId]);

  const left = Math.max(0, notice.spotsNeeded - notice.spotsFilled);
  const take = async () => {
    setBusy(true);
    await onTake(notice);
    setBusy(false);
  };

  return (
    <article className="rounded-2xl bg-card p-5 space-y-3 animate-in" aria-labelledby={`notice-${notice.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-secondary truncate">{notice.leagueName}</p>
          <h2 id={`notice-${notice.id}`} className="text-base font-semibold text-primary">
            {noticeWhen(notice.dateTime, locale)}
          </h2>
        </div>
        <p className="shrink-0 text-right text-sm font-semibold text-warning tabular-nums">
          {t('spotsLeft', { count: left })}
          <span className="block text-xs font-normal text-muted">{t('spotsOf', { filled: notice.spotsFilled, total: notice.spotsNeeded })}</span>
        </p>
      </div>

      <a
        href={fieldMapsUrl({ name: notice.locationName, address: notice.address })}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-2 text-sm text-primary hover:text-accent-text"
      >
        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-medium">{notice.locationName}</span>
          <span className="block text-xs text-secondary">{notice.address}</span>
        </span>
      </a>

      <NoticeFacts notice={notice} />
      {notice.notes && <p className="text-sm text-secondary whitespace-pre-line">{notice.notes}</p>}

      {taken ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-accent-text">
          <Check className="h-4 w-4" aria-hidden="true" /> {t('taken')}
        </p>
      ) : (
        <button type="button" onClick={take} disabled={busy || !profileId} className={btn.primary}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          {t('take')}
        </button>
      )}
    </article>
  );
}
