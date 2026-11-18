'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Star, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { textLink } from '@/components/ui/buttons';
import type { Match } from '@/types/database';
import { lastMatchOutcome } from '@/lib/utils/matchUtils';

const outcomeTone = {
  won: 'border-accent/30 bg-accent/10 text-accent-text',
  drawn: 'border-line bg-card-hover text-secondary',
  lost: 'border-rose-500/30 bg-rose-500/10 text-danger',
} as const;

/** Home → "Ultima partita": mini scoreboard (winner highlighted), then MVP and your result as separate badges. */
export function LastMatchCard({
  match,
  playerId,
  dateLabel,
  nameOf,
}: {
  match: Match;
  playerId: string;
  dateLabel: string;
  nameOf: (id: string) => string;
}) {
  const t = useTranslations('home');
  const { winner, mine } = lastMatchOutcome(match, playerId);

  const team = (side: 'white' | 'black') => {
    const won = winner === side;
    return (
      <div className="flex flex-col items-center gap-1 min-w-0">
        <span className={`text-sm truncate ${won ? 'font-bold text-primary' : 'font-medium text-secondary'}`}>{t(side)}</span>
        {won ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent-text">
            <Trophy className="h-3 w-3" aria-hidden="true" /> {t('winner')}
          </span>
        ) : (
          <span className="h-[15px]" aria-hidden="true" />
        )}
      </div>
    );
  };

  return (
    <section
      className={`bg-card border rounded-2xl p-5 space-y-4 ${mine === 'won' ? 'border-accent/30' : 'border-line'}`}
      aria-labelledby="last-match"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="last-match" className="text-base font-semibold text-primary">{t('lastMatch')}</h2>
        <span className="text-xs text-secondary capitalize">{dateLabel}</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-card-hover/60 px-3 py-4" aria-label={t('scoreboard')} role="group">
        {team('white')}
        <span className="text-4xl font-black text-primary tabular-nums tracking-tight">
          <span className={winner === 'black' ? 'text-secondary' : undefined}>{match.score_white ?? 0}</span>
          <span className="text-muted mx-1.5" aria-hidden="true">–</span>
          <span className={winner === 'white' ? 'text-secondary' : undefined}>{match.score_black ?? 0}</span>
        </span>
        {team('black')}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card-hover px-3 py-1 text-xs text-secondary">
          <Star className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
          {match.mvp_player_id ? (
            <>
              {t('mvp')} <span className="font-semibold text-primary">{nameOf(match.mvp_player_id)}</span>
            </>
          ) : (
            t('mvpNone')
          )}
        </span>
        {mine && (
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${outcomeTone[mine]}`}>
            {t('yours')} {t(mine)}
          </span>
        )}
      </div>

      <Link href="/history" className={`${textLink} w-full justify-center`}>
        {t('goHistory')} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
