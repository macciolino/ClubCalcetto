'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Pencil, Radar } from 'lucide-react';
import { RadarBaseSheet } from './RadarBaseSheet';
import { RadarChart } from '@/components/RadarChart';
import { VerifiedMark } from '@/components/UnconfirmedBadge';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { averageRadars } from '@/lib/utils/externalLevel';
import { cleanBaseRadar, radarOverall } from '@/lib/utils/baseRadar';
import type { CareerSummary } from '@/lib/utils/career';

const ovrOf = (stats: Record<string, number>) => Math.round(radarOverall(stats) * 10);

/**
 * "Radar globale" of the profile, kept clearly apart from the radar each league holds for the person:
 *  - GLOBAL: the Radar Base set at sign-up and the quick ratings leagues left after matches played as a guest. This is
 *    what an external match uses when the person takes a spot from the board;
 *  - LOCAL: one value per league (its own card, confirmed or not by THAT league's managers). A league never changes
 *    the values of another one. docs/ARCHITECTURE.md "Registrazione e Radar Base" and §3.5.
 */
export function GlobalRadarCard({ baseRadar, summary }: { baseRadar?: unknown; summary: CareerSummary }) {
  const t = useTranslations('profile.globalRadar');
  const { activeLeagueId } = useActiveLeague();
  const [editing, setEditing] = useState(false);
  const radar = useMemo(() => cleanBaseRadar(baseRadar), [baseRadar]);
  const ratings = useMemo(
    () => summary.external.list.map((s) => s.rating).filter((r): r is NonNullable<typeof r> => Boolean(r)),
    [summary.external.list]
  );
  const guestAverage = useMemo(() => (ratings.length ? averageRadars(ratings.map((r) => r.stats)) : null), [ratings]);
  const leagues = summary.leagues.filter((l) => l.stats && Object.keys(l.stats).length > 0);

  return (
    <section aria-labelledby="global-radar-title" className="bg-card border border-line-strong dark:border-line-strong/60 rounded-2xl p-5 space-y-5">
      <div>
        <h2 id="global-radar-title" className="text-base font-bold text-primary flex items-center gap-2">
          <Radar className="h-5 w-5 text-accent-text" aria-hidden="true" /> {t('title')}
        </h2>
        <p className="text-xs text-secondary mt-1">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-app border border-line dark:border-line-strong/40 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-primary">{t('base')}</h3>
            {radar && <span className="text-xs font-mono font-bold text-warning tabular-nums">OVR {ovrOf(radar)}</span>}
          </div>
          {radar ? (
            <div className="flex justify-center">
              <RadarChart stats={radar} size={170} color="emerald" showLabels={true} />
            </div>
          ) : (
            <p className="text-xs text-muted">{t('baseNone')}</p>
          )}
          <p className="text-[11px] text-muted">{t('baseHint')}</p>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-text hover:opacity-80">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {radar ? t('editBase') : t('setBase')}
          </button>
        </div>

        <div className="rounded-xl bg-app border border-line dark:border-line-strong/40 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-primary">{t('guest')}</h3>
            {guestAverage && <span className="text-xs font-mono font-bold text-warning tabular-nums">OVR {ovrOf(guestAverage)}</span>}
          </div>
          {guestAverage ? (
            <>
              <div className="flex justify-center">
                <RadarChart stats={guestAverage} size={170} color="blue" showLabels={true} />
              </div>
              <p className="text-[11px] text-muted">{t('guestCount', { count: ratings.length })}</p>
            </>
          ) : (
            <p className="text-xs text-muted">{t('guestNone')}</p>
          )}
          <p className="text-[11px] text-muted">{t('guestHint')}</p>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-secondary">{t('leagues')}</h3>
        {leagues.length === 0 ? (
          <p className="text-xs text-muted">{t('leaguesNone')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {leagues.map((l) => (
              <li key={l.leagueId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-primary">
                  {l.leagueName}
                  {l.leagueId === activeLeagueId && <span className="ml-2 text-xs text-muted">{t('active')}</span>}
                </span>
                <span className="shrink-0 flex items-center gap-2">
                  {l.stat_status === 'UNCONFIRMED' && <span className="text-[11px] text-muted">{t('pending')}</span>}
                  <VerifiedMark status={l.stat_status} />
                  <span className="text-xs font-mono font-bold text-warning tabular-nums">OVR {ovrOf(l.stats as Record<string, number>)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted">{t('leaguesHint')}</p>
      </div>
      {editing && <RadarBaseSheet onClose={() => setEditing(false)} />}
    </section>
  );
}
