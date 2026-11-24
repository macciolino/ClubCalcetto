'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Megaphone, Plus, SlidersHorizontal, X } from 'lucide-react';
import { btnInline } from '@/components/ui/buttons';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoticeCard, mapsFor, noticeStatusKey, noticeWhen } from '@/components/board/NoticeCard';
import { JoinNoticeSheet } from '@/components/board/JoinNoticeSheet';
import { NoticeFormSheet } from '@/components/board/NoticeFormSheet';
import { NoticeManageSheet } from '@/components/board/NoticeManageSheet';
import { useAuth } from '@/lib/context/AuthContext';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { subscribeLeagueNotices, subscribeMySpots, subscribeOpenNotices } from '@/lib/services/matchNoticeService';
import { FORMAT_INFO, MATCH_FORMATS } from '@/lib/utils/matchFormat';
import { NO_FILTERS, filterNotices, type NoticeFilters } from '@/lib/utils/matchNotice';
import { NOTICE_ROLES, type MatchNotice, type MySpot } from '@/types/matchNotice';
import type { MatchFormat } from '@/types/database';

const chip = (on: boolean) =>
  `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-accent text-on-accent' : 'bg-card text-secondary hover:text-primary'}`;
const select =
  'shrink-0 w-auto rounded-full bg-card pl-3 pr-7 py-1.5 text-xs font-semibold text-secondary border border-transparent focus:outline-none focus:border-line-strong';

/**
 * "Cerco giocatore": open notices of EVERY league (any verified user takes a spot without joining the league),
 * with light filters; the person's own upcoming spots; for presidents, collaborators and platform staff the notices
 * of the active league. docs/ARCHITECTURE.md §3.5.
 */
export default function BoardPage() {
  const t = useTranslations('board');
  const { locale } = useLocaleSetting();
  const { user, profile } = useAuth();
  const { activeLeagueId, leagues, canManageMatchesAndCash } = useActiveLeague();
  const [open, setOpen] = useState<MatchNotice[] | null>(null);
  const [mine, setMine] = useState<MatchNotice[]>([]);
  const [spots, setSpots] = useState<MySpot[]>([]);
  // "Now" for filters and my spots: taken when data arrives (the clock is not read while rendering)
  const [now, setNow] = useState(0);
  const [filters, setFilters] = useState<NoticeFilters>(NO_FILTERS);
  const [form, setForm] = useState<{ notice?: MatchNotice } | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [joining, setJoining] = useState<MatchNotice | null>(null);

  const ready = Boolean(user && isFirebaseConfigured);
  useEffect(
    () =>
      ready
        ? subscribeOpenNotices((list) => {
            setOpen(list);
            setNow(Date.now());
          })
        : undefined,
    [ready]
  );
  useEffect(
    () => (ready && canManageMatchesAndCash && activeLeagueId ? subscribeLeagueNotices(activeLeagueId, setMine) : undefined),
    [ready, canManageMatchesAndCash, activeLeagueId]
  );
  useEffect(
    () =>
      ready && profile?.id
        ? subscribeMySpots(profile.id, (list) => {
            setSpots(list);
            setNow(Date.now());
          })
        : undefined,
    [ready, profile?.id]
  );

  const takenIds = useMemo(() => new Set(spots.filter((s) => s.status === 'ACTIVE').map((s) => s.noticeId)), [spots]);
  // My upcoming spots (a cancelled one stays visible until its day, marked, so the person knows)
  const upcoming = useMemo(
    () => spots.filter((s) => Date.parse(s.dateTime) > now).sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
    [spots, now]
  );
  const shown = useMemo(() => (open ? filterNotices(open, filters, now) : []), [open, filters, now]);
  const filtered = filters.when !== 'all' || filters.format !== 'all' || filters.role !== 'all';

  const leagueName = leagues.find((l) => l.id === activeLeagueId)?.name || '';
  const managed = managing ? mine.find((n) => n.id === managing) : undefined;

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

      {upcoming.length > 0 && (
        <section aria-labelledby="my-spots" className="space-y-2">
          <h2 id="my-spots" className="text-sm font-semibold text-secondary">
            {t('mySpots')}
          </h2>
          <ul className="space-y-1.5">
            {upcoming.map((s) => (
              <li key={s.noticeId} className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-primary truncate">
                    {noticeWhen(s.dateTime, locale)} · {s.leagueName}
                  </span>
                  <a href={mapsFor(s)} target="_blank" rel="noopener noreferrer" className="block text-xs text-secondary truncate hover:text-accent-text">
                    {s.locationName} · {s.address}
                  </a>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    s.status === 'CANCELLED' ? 'bg-rose-500/10 text-danger' : 'bg-accent/15 text-accent-text'
                  }`}
                >
                  {s.status === 'CANCELLED' ? t('spotCancelled') : t('spotConfirmed')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                      <span className="block text-sm font-medium text-primary truncate">
                        {noticeWhen(n.dateTime, locale)} · {n.locationName}
                      </span>
                      <span className="block text-xs text-secondary">
                        {t(`status.${noticeStatusKey(n)}`)}
                        {' · '}
                        {t('spotsOf', { filled: n.spotsFilled, total: n.spotsNeeded })}
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

        {open && open.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('filters.label')}>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            {(['all', 'today', 'week'] as const).map((w) => (
              <button key={w} type="button" aria-pressed={filters.when === w} onClick={() => setFilters((f) => ({ ...f, when: w }))} className={chip(filters.when === w)}>
                {t(`filters.${w}`)}
              </button>
            ))}
            <select
              aria-label={t('filters.format')}
              value={filters.format}
              onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value as MatchFormat | 'all' }))}
              className={select}
            >
              <option value="all">{t('filters.anyFormat')}</option>
              {MATCH_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_INFO[f].label}
                </option>
              ))}
            </select>
            <select
              aria-label={t('filters.role')}
              value={filters.role}
              onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value as NoticeFilters['role'] }))}
              className={select}
            >
              <option value="all">{t('filters.anyRole')}</option>
              {NOTICE_ROLES.filter((r) => r !== 'ANY').map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
            {filtered && (
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-accent-text">
                <X className="h-3.5 w-3.5" aria-hidden="true" /> {t('filters.reset')}
              </button>
            )}
          </div>
        )}

        {open === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl bg-card px-6 py-10 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-app">
              <Megaphone className="h-5 w-5 text-muted" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold text-primary">{filtered ? t('emptyFiltered') : t('empty')}</p>
            <p className="mt-1 text-xs text-secondary max-w-sm mx-auto">{filtered ? t('emptyFilteredHint') : t('emptyHint')}</p>
            {filtered && (
              <button type="button" onClick={() => setFilters(NO_FILTERS)} className={`${btnInline.secondary} mt-4`}>
                {t('filters.reset')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((n) => (
              <NoticeCard key={n.id} notice={n} taken={takenIds.has(n.id)} onJoin={setJoining} />
            ))}
          </div>
        )}
      </section>

      {joining && <JoinNoticeSheet notice={joining} onClose={() => setJoining(null)} />}
      {form && <NoticeFormSheet notice={form.notice} onClose={() => setForm(null)} />}
      {managed && !form && <NoticeManageSheet notice={managed} onEdit={() => setForm({ notice: managed })} onClose={() => setManaging(null)} />}
    </div>
  );
}
