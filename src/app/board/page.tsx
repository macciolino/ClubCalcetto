'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Megaphone, Plus } from 'lucide-react';
import { btnInline } from '@/components/ui/buttons';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoticeCard, noticeWhen } from '@/components/board/NoticeCard';
import { NoticeFormSheet } from '@/components/board/NoticeFormSheet';
import { NoticeManageSheet } from '@/components/board/NoticeManageSheet';
import { useAuth } from '@/lib/context/AuthContext';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { subscribeLeagueNotices, subscribeOpenNotices, takeNoticeSpot } from '@/lib/services/matchNoticeService';
import type { MatchNotice } from '@/types/matchNotice';

/**
 * "Cerco giocatore": open notices of EVERY league (any verified user takes a spot without joining the league) and,
 * for presidents, collaborators and platform staff, the notices of the active league. docs/ARCHITECTURE.md §3.5.
 */
export default function BoardPage() {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const { user, profile } = useAuth();
  const { activeLeagueId, leagues, canManageMatchesAndCash } = useActiveLeague();
  const [open, setOpen] = useState<MatchNotice[] | null>(null);
  const [mine, setMine] = useState<MatchNotice[]>([]);
  const [form, setForm] = useState<{ notice?: MatchNotice } | null>(null);
  const [managing, setManaging] = useState<string | null>(null);

  const ready = Boolean(user && isFirebaseConfigured);
  useEffect(() => (ready ? subscribeOpenNotices(setOpen) : undefined), [ready]);
  useEffect(
    () => (ready && canManageMatchesAndCash && activeLeagueId ? subscribeLeagueNotices(activeLeagueId, setMine) : undefined),
    [ready, canManageMatchesAndCash, activeLeagueId]
  );

  const leagueName = leagues.find((l) => l.id === activeLeagueId)?.name || '';
  const managed = managing ? mine.find((n) => n.id === managing) : undefined;

  const take = async (n: MatchNotice) => {
    const where = `${noticeWhen(n.dateTime, locale)} · ${n.locationName}`;
    if (!(await askConfirm(t('confirmTake', { where, league: n.leagueName })))) return;
    const res = await takeNoticeSpot(n.id);
    notify(res === 'ok' ? t('tookIt') : t(`errors.${res}`), res === 'ok' ? 'success' : 'error');
  };

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">{t('title')}</h1>
          <p className="text-sm text-secondary mt-1">{t('subtitle')}</p>
        </div>
        {canManageMatchesAndCash && activeLeagueId && (
          <button type="button" onClick={() => setForm({})} className={btnInline.primary}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('newNotice')}
          </button>
        )}
      </header>

      {canManageMatchesAndCash && activeLeagueId && (
        <section aria-labelledby="my-notices" className="space-y-2">
          <h2 id="my-notices" className="text-sm font-semibold text-secondary">
            {t('leagueNotices', { league: leagueName })}
          </h2>
          {mine.length === 0 ? (
            <p className="text-sm text-muted">{t('noLeagueNotices')}</p>
          ) : (
            <ul className="space-y-1.5">
              {mine.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setManaging(n.id)}
                    className="w-full flex items-center gap-3 rounded-xl bg-card hover:bg-card-hover px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-primary first-letter:uppercase truncate">
                        {noticeWhen(n.dateTime, locale)} · {n.locationName}
                      </span>
                      <span className="block text-xs text-secondary">
                        {t(`status.${n.status}`)} · {t('spotsOf', { filled: n.spotsFilled, total: n.spotsNeeded })}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="open-notices" className="space-y-3">
        <h2 id="open-notices" className="text-sm font-semibold text-secondary">
          {t('openNotices')}
        </h2>
        {open === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : open.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center">
            <Megaphone className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
            <p className="mt-2 text-sm text-secondary">{t('empty')}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {open.map((n) => (
              <NoticeCard key={n.id} notice={n} profileId={profile?.id || null} onTake={take} />
            ))}
          </div>
        )}
      </section>

      {form && <NoticeFormSheet notice={form.notice} onClose={() => setForm(null)} />}
      {managed && !form && (
        <NoticeManageSheet
          notice={managed}
          onEdit={() => setForm({ notice: managed })}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  );
}
