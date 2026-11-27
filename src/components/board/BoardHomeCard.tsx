'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Megaphone } from 'lucide-react';
import { textLink } from '@/components/ui/buttons';
import { surface } from '@/components/ui/surfaces';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { useInterestingNotices } from '@/lib/hooks/useOpenNoticeCount';
import { FORMAT_INFO } from '@/lib/utils/matchFormat';
import { noticeWhen } from './NoticeCard';

/**
 * Home: a compact way into the "Cerco giocatore" board. Shown only when OTHER leagues are looking for players
 * (the active league's own notices are for outsiders: its members simply sign up), skipping the notices this person
 * hid or already took, and never when they hid the whole board. The soonest one + how many.
 */
export function BoardHomeCard({ leagueId }: { leagueId: string | null }) {
  const t = useTranslations('board.home');
  const { locale } = useLocaleSetting();
  const others = useInterestingNotices(true, leagueId);
  if (others.length === 0) return null;
  const next = others[0];
  const left = Math.max(0, next.spotsNeeded - next.spotsFilled);

  return (
    <section aria-labelledby="board-home" className={`${surface.card} p-5 space-y-3`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="board-home" className="text-sm font-semibold text-primary flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-accent-text" aria-hidden="true" /> {t('title')}
        </h2>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-warning tabular-nums">{t('count', { count: others.length })}</span>
      </div>
      <div className={`${surface.inset} px-3.5 py-2.5 text-sm`}>
        <p className="font-semibold text-primary">{noticeWhen(next.dateTime, locale)}</p>
        <p className="text-xs text-secondary truncate">
          {next.leagueName} · {next.locationName} · {FORMAT_INFO[next.format]?.label} · {t('spotsFree', { count: left })}
        </p>
      </div>
      <Link href="/board" className={textLink}>
        {t('cta')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
