'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Globe, Loader2, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { surface } from '@/components/ui/surfaces';
import { textLink } from '@/components/ui/buttons';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { fetchPublicLeagues, joinPublicLeague } from '@/lib/services/onboardingService';
import { FORMAT_INFO } from '@/lib/utils/matchFormat';
import type { PublicLeague } from '@/lib/utils/publicLeagues';

/**
 * Public leagues (docs/ARCHITECTURE.md §3.1): the active public leagues the account is not in, as clickable cards (name,
 * usual format, average OVR or "Nuova lega", players and matches). Tapping one asks to confirm and joins it: the card
 * starts from the Radar Base with the values unconfirmed. Used by the entry screen (first few, "Vedi tutte"), by the
 * page /leagues (all, with search) and, in short, by the Home of a league member.
 */
export type PublicLeaguesState = PublicLeague[] | 'loading' | 'error';

/** Loads the public leagues once and joins one (confirmation, then the new league becomes the active one). */
export function usePublicLeagues() {
  const t = useTranslations('publicLeagues');
  const { setActiveLeague } = useActiveLeague();
  const [leagues, setLeagues] = useState<PublicLeaguesState>('loading');
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

  const join = useCallback(
    async (l: PublicLeague) => {
      if (busy || !(await askConfirm(t('confirm', { name: l.name })))) return false;
      setBusy(l.id);
      if (await joinPublicLeague(l.id)) {
        setActiveLeague(l.id); // the league opens as soon as the membership arrives
        notify(t('joined', { name: l.name }), 'success');
        return true;
      }
      notify(t('joinFailed'), 'error');
      setBusy('');
      return false;
    },
    [busy, setActiveLeague, t]
  );

  return { leagues, busy, join };
}

/** One public league as a card: the whole card is the "Entra" button. */
export function PublicLeagueCard({ league: l, busy, onJoin }: { league: PublicLeague; busy: string; onJoin: (l: PublicLeague) => void }) {
  const t = useTranslations('publicLeagues');
  const ovr = l.avgOverall === null ? t('newLeague') : t('ovrAvg', { value: Math.round(l.avgOverall * 10) });
  const format = FORMAT_INFO[l.format]?.label || l.format;
  return (
    <button
      type="button"
      onClick={() => onJoin(l)}
      disabled={Boolean(busy)}
      aria-label={t('cardLabel', { name: l.name, format, ovr, players: t('players', { count: l.players }), matches: t('matches', { count: l.matches }) })}
      className={`${surface.card} w-full min-w-0 text-left space-y-3 p-4 transition-colors hover:border-line-strong hover:bg-card-hover/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-base font-bold text-primary break-words">{l.name}</span>
        <span className={`shrink-0 rounded-full bg-app px-2.5 py-0.5 text-xs font-semibold text-primary ${surface.pill}`}>{format}</span>
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
  );
}

/** List of cards, with loading / error / empty states (shared by the entry screen and the page). */
export function PublicLeagueList({ leagues, busy, onJoin, emptyText }: { leagues: PublicLeaguesState; busy: string; onJoin: (l: PublicLeague) => void; emptyText: string }) {
  const t = useTranslations('publicLeagues');
  if (leagues === 'loading')
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="status" aria-label={t('loading')}>
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  if (leagues === 'error')
    return (
      <p role="alert" className={`${surface.card} px-4 py-5 text-sm text-secondary`}>
        {t('failed')}
      </p>
    );
  if (leagues.length === 0) return <p className={`${surface.card} px-4 py-5 text-sm text-secondary`}>{emptyText}</p>;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {leagues.map((l) => (
        <li key={l.id} className="min-w-0">
          <PublicLeagueCard league={l} busy={busy} onJoin={onJoin} />
        </li>
      ))}
    </ul>
  );
}

const PREVIEW = 4;

/** Entry screen (no league): the first public leagues and "Vedi tutte e cerca" to the full page. */
export function PublicLeagues() {
  const t = useTranslations('publicLeagues');
  const { leagues, busy, join } = usePublicLeagues();
  const shown = Array.isArray(leagues) ? leagues.slice(0, PREVIEW) : leagues;

  return (
    <section aria-labelledby="public-leagues" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="space-y-0.5 min-w-0">
          <h2 id="public-leagues" className="text-base font-bold text-primary">
            {t('title')}
          </h2>
          <p className="text-xs text-secondary">{t('subtitle')}</p>
        </div>
        {Array.isArray(leagues) && leagues.length > 0 && (
          <Link href="/leagues" className={textLink}>
            {leagues.length > PREVIEW ? t('seeAll', { count: leagues.length }) : t('search')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      <PublicLeagueList leagues={shown} busy={busy} onJoin={join} emptyText={t('empty')} />
    </section>
  );
}

/**
 * Home of a league member: the public leagues in short (how many there are) and the link to the page with all of them.
 * Placed at the end of the side column: last on the phone, beside the match on the PC, never above the league's own match.
 */
export function PublicLeaguesHomeCard() {
  const t = useTranslations('publicLeagues');
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPublicLeagues().then((list) => {
      if (alive) setCount(list ? list.length : null);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section aria-labelledby="public-leagues-home" className={`${surface.card} p-5 space-y-3`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent-text">
          <Globe className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h2 id="public-leagues-home" className="text-base font-semibold text-primary">
            {t('title')}
          </h2>
          <p className="text-sm text-secondary">
            {count === null ? t('homeHint') : count === 0 ? t('none') : t('homeCount', { count })}
          </p>
        </div>
      </div>
      <Link href="/leagues" className={textLink}>
        {t('open')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
