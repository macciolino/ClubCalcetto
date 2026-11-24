'use client';

import { useTranslations } from 'next-intl';
import { Globe2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { noticeWhen } from '@/components/board/NoticeCard';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { useCareer } from '@/lib/hooks/useCareer';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { FORMAT_INFO } from '@/lib/utils/matchFormat';

const pill = 'rounded-full bg-app px-3.5 py-1.5 text-xs text-secondary tabular-nums';
const num = (v: number, cls: string) => <span className={v > 0 ? cls : 'text-muted'}>{v}</span>;

/**
 * "Carriera globale" (profile): every league of the account + the matches played as an external through the
 * board, kept apart from the active league's statistics. External matches carry a discreet "Da esterno" badge.
 */
export function CareerCard({ profileId }: { profileId: string }) {
  const t = useTranslations('profile.career');
  const { locale } = useLocaleSetting();
  const { activeLeagueId } = useActiveLeague();
  const career = useCareer(profileId);

  return (
    <section aria-labelledby="career-title" className="bg-card border border-line rounded-2xl p-5 space-y-4">
      <div>
        <h2 id="career-title" className="text-base font-bold text-primary flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-accent-text" aria-hidden="true" /> {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-1">{t('subtitle')}</p>
      </div>

      {!career ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <span className={`${pill} font-semibold text-primary`}>{t('played', { count: career.totals.played })}</span>
            <span className={pill}>
              {t('won')} {num(career.totals.won, 'text-emerald-600 dark:text-emerald-400')} · {t('drawn')} {num(career.totals.drawn, 'text-warning')} · {t('lost')}{' '}
              {num(career.totals.lost, 'text-danger')}
            </span>
            <span className={pill}>{t('externalCount', { count: career.external.played })}</span>
          </div>

          {career.leagues.length > 0 && (
            <ul className="divide-y divide-line">
              {career.leagues.map((l) => (
                <li key={l.leagueId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-primary">
                    {l.leagueName}
                    {l.leagueId === activeLeagueId && <span className="ml-2 text-xs text-muted">{t('activeLeague')}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-secondary tabular-nums">
                    {t('leagueLine', { played: l.played, won: l.won, drawn: l.drawn, lost: l.lost })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {career.external.list.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-secondary">{t('externalTitle')}</h3>
              <ul className="space-y-1.5">
                {career.external.list.slice(0, 5).map((s, i) => (
                  <li key={s.noticeId} className="flex items-center justify-between gap-3 rounded-xl bg-app px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-primary truncate">
                        {noticeWhen(s.dateTime, locale)}
                        {/* the list is newest first: the first `upcoming` ones are still to be played */}
                        {i < career.external.upcoming && <span className="ml-2 text-xs font-normal text-muted">{t('upcoming')}</span>}
                      </span>
                      <span className="block text-xs text-secondary truncate">
                        {s.leagueName} · {s.locationName} · {FORMAT_INFO[s.format]?.label}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium text-secondary">
                      {t('externalBadge')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted">{t('externalHint')}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
