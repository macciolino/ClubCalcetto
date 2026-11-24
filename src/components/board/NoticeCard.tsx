'use client';

import { useTranslations } from 'next-intl';
import { Check, MapPin, Navigation, UserPlus } from 'lucide-react';
import { btn } from '@/components/ui/buttons';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { FORMAT_INFO } from '@/lib/utils/matchFormat';
import { fieldMapsUrl } from '@/lib/utils/matchUtils';
import type { MatchNotice, NoticeRole, ShirtColor } from '@/types/matchNotice';

/** Day and time of the match in Italian time, in the app's language ("Sab 28 nov · 20:30"). */
export function noticeWhen(iso: string, locale: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(locale, { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(locale, { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
  const text = `${day} · ${time}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Status shown to managers: a notice closed because every spot was taken reads "Completo". */
export const noticeStatusKey = (n: MatchNotice) => (n.status === 'CLOSED' && n.closedReason === 'full' ? 'FULL' : n.status);

export const euro = (n: number, locale: string) =>
  n.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });

export const mapsFor = (n: Pick<MatchNotice, 'locationName' | 'address'>) => fieldMapsUrl({ name: n.locationName, address: n.address });

/** Role wanted: goalkeepers in sky (like the POR badge), any other role neutral. */
export function RoleBadge({ role }: { role: NoticeRole }) {
  const t = useTranslations('board');
  const keeper = role === 'GOALKEEPER' || role === 'ROTATION_GOALKEEPER';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${keeper ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'bg-app text-secondary'}`}>
      {t(`roles.${role}`)}
    </span>
  );
}

/** Shirt colour: a small swatch (dark / light, like the Neri / Bianchi ovals) + its name. */
export function ShirtBadge({ color }: { color: ShirtColor }) {
  const t = useTranslations('board');
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-app px-2.5 py-1 text-xs text-secondary">
      <span
        aria-hidden="true"
        className={`h-3 w-3 rounded-full ${color === 'DARK' ? 'bg-slate-950 ring-1 ring-slate-600' : 'bg-white ring-1 ring-line-strong'}`}
      />
      {t(`shirts.${color}`)}
    </span>
  );
}

/** Format, role and shirt as pills (board card, confirmation and managers' sheet). */
export function NoticeFacts({ notice }: { notice: Pick<MatchNotice, 'format' | 'roleNeeded' | 'shirtColor'> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="rounded-full bg-app px-2.5 py-1 text-xs font-semibold text-primary">{FORMAT_INFO[notice.format]?.label || notice.format}</span>
      <RoleBadge role={notice.roleNeeded} />
      <ShirtBadge color={notice.shirtColor} />
    </div>
  );
}

/** The quota each, big, with the field's total next to it. */
export function NoticePrice({ notice }: { notice: Pick<MatchNotice, 'costPerPlayer' | 'totalFieldCost'> }) {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  return (
    <p className="flex items-baseline gap-2">
      <span className="text-lg font-bold text-primary tabular-nums">
        {notice.costPerPlayer > 0 ? t('perHead', { amount: euro(notice.costPerPlayer, locale) }) : t('free')}
      </span>
      {notice.totalFieldCost > 0 && <span className="text-xs text-muted tabular-nums">{t('fieldTotal', { amount: euro(notice.totalFieldCost, locale) })}</span>}
    </p>
  );
}

/** One notice on the board: scannable at a glance, with "Partecipa alla partita" (or "Hai preso il posto"). */
export function NoticeCard({ notice, taken, onJoin }: { notice: MatchNotice; taken: boolean; onJoin: (n: MatchNotice) => void }) {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const left = Math.max(0, notice.spotsNeeded - notice.spotsFilled);

  return (
    <article className="flex flex-col rounded-2xl bg-card p-5 gap-3 animate-in" aria-labelledby={`notice-${notice.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-secondary truncate">{notice.leagueName}</p>
          <h2 id={`notice-${notice.id}`} className="text-lg font-bold text-primary tabular-nums">
            {noticeWhen(notice.dateTime, locale)}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-warning tabular-nums">
          {t('spotsFree', { count: left })}
        </span>
      </div>

      <NoticeFacts notice={notice} />

      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-2 text-sm min-w-0">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-medium text-primary truncate">{notice.locationName}</span>
            <span className="block text-xs text-secondary">{notice.address}</span>
          </span>
        </p>
        <a
          href={mapsFor(notice)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:opacity-80"
        >
          <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> {t('directions')}
        </a>
      </div>

      <NoticePrice notice={notice} />
      {notice.notes && <p className="text-sm text-secondary whitespace-pre-line">{notice.notes}</p>}

      <div className="mt-auto pt-1">
        {taken ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-accent-text">
            <Check className="h-4 w-4" aria-hidden="true" /> {t('taken')}
          </p>
        ) : (
          <button type="button" onClick={() => onJoin(notice)} className={btn.primary}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> {t('join')}
          </button>
        )}
      </div>
    </article>
  );
}
