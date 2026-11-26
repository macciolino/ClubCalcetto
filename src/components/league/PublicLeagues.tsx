'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { fetchPublicLeagues, joinPublicLeague } from '@/lib/services/onboardingService';
import { FORMAT_INFO } from '@/lib/utils/matchFormat';
import type { PublicLeague } from '@/lib/utils/publicLeagues';

/**
 * Welcome screen of an account without a league (docs/ARCHITECTURE.md, "Registrazione e Radar Base"): the public leagues as
 * clickable cards (name, usual format, average OVR or "Nuova lega", matches played). Tapping one asks to confirm and joins
 * it: the card starts from the Radar Base with the values unconfirmed.
 */
export function PublicLeagues() {
  const t = useTranslations('publicLeagues');
  const { setActiveLeague } = useActiveLeague();
  const [leagues, setLeagues] = useState<PublicLeague[] | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let alive = true;
    fetchPublicLeagues().then((list) => {
      if (alive) setLeagues(list ?? 'error');
    });
    return () => {
      alive = false;
    };
  }, []);

  const join = async (l: PublicLeague) => {
    if (busy || !(await askConfirm(t('confirm', { name: l.name })))) return;
    setBusy(l.id);
    if (await joinPublicLeague(l.id)) {
      setActiveLeague(l.id); // the welcome screen gives way to the league as soon as the membership arrives
      notify(t('joined', { name: l.name }), 'success');
    } else {
      notify(t('joinFailed'), 'error');
      setBusy('');
    }
  };

  return (
    <section aria-labelledby="public-leagues" className="space-y-3">
      <div className="space-y-0.5">
        <h2 id="public-leagues" className="text-base font-bold text-primary">
          {t('title')}
        </h2>
        <p className="text-xs text-secondary">{t('subtitle')}</p>
      </div>

      {leagues === 'loading' ? (
        <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label={t('loading')}>
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : leagues === 'error' ? (
        <p role="alert" className="rounded-2xl border border-line bg-card px-4 py-5 text-sm text-secondary">
          {t('failed')}
        </p>
      ) : leagues.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-5 text-sm text-secondary">{t('empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {leagues.map((l) => {
            const ovr = l.avgOverall === null ? t('newLeague') : t('ovrAvg', { value: Math.round(l.avgOverall * 10) });
            const format = FORMAT_INFO[l.format]?.label || l.format;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => join(l)}
                  disabled={Boolean(busy)}
                  aria-label={t('cardLabel', { name: l.name, format, ovr, players: t('players', { count: l.players }), matches: t('matches', { count: l.matches }) })}
                  className="w-full text-left space-y-3 rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-base font-bold text-primary break-words">{l.name}</span>
                    <span className="shrink-0 rounded-full border border-line-strong bg-app px-2.5 py-0.5 text-xs font-semibold text-primary">{format}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
                        l.avgOverall === null ? 'border-line bg-app text-secondary' : 'border-accent/40 bg-accent/10 text-accent-text'
                      }`}
                    >
                      {ovr}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-3 text-xs text-secondary">
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {t('players', { count: l.players })} · {t('matches', { count: l.matches })}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-semibold text-accent-text">
                      {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      {t('join')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
