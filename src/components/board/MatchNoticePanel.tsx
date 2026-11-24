'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Ban, Lock, Pencil, UserSearch } from 'lucide-react';
import { btn, btnInline, textLink } from '@/components/ui/buttons';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { subscribeMatchNotices } from '@/lib/services/matchNoticeService';
import { FORMAT_INFO } from '@/lib/utils/matchFormat';
import { romeToIso } from '@/lib/utils/matchNotice';
import type { MatchFormat, SportField } from '@/types/database';
import type { MatchNotice, MatchNoticeInput } from '@/types/matchNotice';
import { NoticeFormSheet } from './NoticeFormSheet';
import { ApplicantsList, closeOrCancel } from './NoticeManageSheet';
import { noticeStatusKey } from './NoticeCard';

interface Props {
  /** The match day (YYYY-MM-DD) and its details as the "Partita della settimana" shows them */
  date: string;
  time: string;
  field?: SportField;
  location: string;
  format: MatchFormat;
  totalCost: number;
  /** Starters still missing to fill the format */
  missing: number;
  /** The day is over: no new notice, only the invite to who played */
  past: boolean;
}

/**
 * "Giocatori esterni" inside the match (managers only, Impostazioni → Partita): the notice of THIS match on the
 * board, or "Cerca giocatori esterni" with the match data already filled in. docs/ARCHITECTURE.md §3.5.
 */
export function MatchNoticePanel({ date, time, field, location, format, totalCost, missing, past }: Props) {
  const t = useTranslations('board.panel');
  const tb = useTranslations('board');
  const { activeLeagueId } = useActiveLeague();
  const [notices, setNotices] = useState<MatchNotice[]>([]);
  const [form, setForm] = useState<{ notice?: MatchNotice } | null>(null);
  useEffect(() => (activeLeagueId ? subscribeMatchNotices(activeLeagueId, date, setNotices) : undefined), [activeLeagueId, date]);

  // The notice that counts: the live one, otherwise the latest (closed or cancelled)
  const current = notices.find((n) => n.status !== 'CANCELLED') || notices[0];
  const live = current && current.status !== 'CANCELLED' ? current : undefined;

  const players = FORMAT_INFO[format].players;
  const prefill: Partial<MatchNoticeInput> = {
    matchId: date,
    dateTime: romeToIso(date, time),
    locationName: field?.name || location,
    address: field?.address || '',
    format,
    totalFieldCost: totalCost,
    costPerPlayer: Math.round((totalCost / players) * 100) / 100,
    spotsNeeded: Math.max(1, missing),
  };

  return (
    <div className="space-y-3 pt-4 border-t border-line">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-primary flex items-center gap-2">
          <UserSearch className="h-4 w-4 text-accent-text" aria-hidden="true" /> {t('title')}
        </p>
        {current && (
          <span className="rounded-full bg-app px-2.5 py-1 text-xs text-secondary">
            {tb(`status.${noticeStatusKey(current)}`)} · {tb('spotsOf', { filled: current.spotsFilled, total: current.spotsNeeded })}
          </span>
        )}
      </div>

      {live ? (
        <>
          <ApplicantsList notice={live} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setForm({ notice: live })} className={btnInline.secondary}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> {tb('manage.edit')}
            </button>
            {live.status === 'OPEN' && (
              <button type="button" onClick={() => closeOrCancel(live, 'close', tb)} className={btnInline.secondary}>
                <Lock className="h-4 w-4" aria-hidden="true" /> {tb('manage.close')}
              </button>
            )}
            <button type="button" onClick={() => closeOrCancel(live, 'cancel', tb)} className={btnInline.danger}>
              <Ban className="h-4 w-4" aria-hidden="true" /> {tb('manage.cancel')}
            </button>
          </div>
          <Link href="/board" className={textLink}>
            {t('seeOnBoard')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </>
      ) : past ? (
        <p className="text-sm text-secondary">{current ? t('cancelledPast') : t('nonePast')}</p>
      ) : (
        <>
          <p className="text-sm text-secondary">
            {missing > 0 ? t('missing', { count: missing }) : t('hint')}
            {current && ` ${t('previousCancelled')}`}
          </p>
          <button type="button" onClick={() => setForm({})} className={btn.secondary}>
            <UserSearch className="h-4 w-4" aria-hidden="true" /> {t('search')}
          </button>
        </>
      )}

      {form && <NoticeFormSheet notice={form.notice} prefill={form.notice ? undefined : prefill} onClose={() => setForm(null)} />}
    </div>
  );
}
