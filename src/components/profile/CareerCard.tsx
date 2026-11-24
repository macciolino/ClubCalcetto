'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe2, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { useCareer } from '@/lib/hooks/useCareer';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { formatLongDate } from '@/lib/utils/dateUtils';
import type { HistoryEntry } from '@/lib/utils/career';

const pill = 'rounded-full bg-app px-3.5 py-1.5 text-xs text-secondary tabular-nums';
const chip = (on: boolean) =>
  `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-accent text-on-accent' : 'bg-app text-secondary hover:text-primary'}`;
const num = (v: number, cls: string) => <span className={v > 0 ? cls : 'text-muted'}>{v}</span>;
const RESULT_TONE = { won: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', drawn: 'bg-amber-500/15 text-warning', lost: 'bg-rose-500/10 text-danger' };
const PAGE = 8;

/**
 * "Carriera globale" (profile): every league of the account + the matches played as an external through the board,
 * kept apart from the active league's statistics. Below, the personal history across leagues with a league filter;
 * external matches carry a discreet "Ospite · Lega" badge.
 */
export function CareerCard({ profileId }: { profileId: string }) {
  const t = useTranslations('profile.career');
  const { locale } = useLocaleSetting();
  const { activeLeagueId } = useActiveLeague();
  const career = useCareer(profileId);
  const [league, setLeague] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const history = useMemo(() => career?.history || [], [career]);
  const leagueChips = useMemo(() => Array.from(new Map(history.map((e) => [e.leagueId, e.leagueName])).entries()), [history]);
  const shown = league === 'all' ? history : history.filter((e) => e.leagueId === league);
  const goals = history.reduce((t2, e) => t2 + e.goals, 0);
  const mvps = history.filter((e) => e.mvp).length;

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
            <span className={`${pill} font-semibold text-primary`}>{t('played', { count: career.summary.totals.played })}</span>
            <span className={pill}>
              {t('won')} {num(career.summary.totals.won, 'text-emerald-600 dark:text-emerald-400')} · {t('drawn')} {num(career.summary.totals.drawn, 'text-warning')} ·{' '}
              {t('lost')} {num(career.summary.totals.lost, 'text-danger')}
            </span>
            <span className={pill}>{t('goalsMvp', { goals, mvp: mvps })}</span>
            <span className={pill}>{t('externalCount', { count: career.summary.external.played })}</span>
          </div>

          {career.summary.leagues.length > 0 && (
            <ul className="divide-y divide-line">
              {career.summary.leagues.map((l) => (
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

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-secondary">{t('historyTitle')}</h3>
            {history.length === 0 ? (
              <p className="text-xs text-muted">{t('historyEmpty')}</p>
            ) : (
              <>
                {leagueChips.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filterLabel')}>
                    <button type="button" aria-pressed={league === 'all'} onClick={() => setLeague('all')} className={chip(league === 'all')}>
                      {t('allLeagues')}
                    </button>
                    {leagueChips.map(([id, name]) => (
                      <button key={id} type="button" aria-pressed={league === id} onClick={() => setLeague(id)} className={chip(league === id)}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                <ul className="space-y-1.5">
                  {(showAll ? shown : shown.slice(0, PAGE)).map((e) => (
                    <HistoryRow key={e.key} entry={e} date={formatLongDate(e.date, locale)} />
                  ))}
                </ul>
                {shown.length > PAGE && (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-accent-text">
                    {showAll ? t('showLess') : t('showAll', { count: shown.length })}
                  </button>
                )}
                <p className="text-[11px] text-muted">{t('externalHint')}</p>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function HistoryRow({ entry: e, date }: { entry: HistoryEntry; date: string }) {
  const t = useTranslations('profile.career');
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-app px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className="block font-medium text-primary truncate first-letter:uppercase">{date}</span>
        <span className="flex items-center gap-1.5 text-xs text-secondary min-w-0">
          {e.external ? (
            <span className="shrink-0 rounded-full border border-line-strong px-2 py-px text-[11px] font-medium">{t('guestBadge', { league: e.leagueName })}</span>
          ) : (
            <span className="truncate">{e.leagueName}</span>
          )}
          {e.score && <span className="tabular-nums">· {e.score.white}–{e.score.black}</span>}
          {e.goals > 0 && <span>· {t('goalsShort', { count: e.goals })}</span>}
          {e.mvp && <Star className="h-3.5 w-3.5 text-warning fill-amber-400" aria-label={t('mvpLabel')} />}
        </span>
      </span>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${e.result ? RESULT_TONE[e.result] : 'bg-card text-muted'}`}>
        {e.result ? t(`result.${e.result}`) : t('result.pending')}
      </span>
    </li>
  );
}
