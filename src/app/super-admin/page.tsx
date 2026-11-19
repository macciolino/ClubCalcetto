'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Ban, Loader2, PlayCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/context/AuthContext';
import { useLocaleSetting } from '@/i18n/I18nProvider';
import { askConfirm, notify } from '@/components/ui/Feedback';
import { btnInline, textLink } from '@/components/ui/buttons';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { deletePlatformLeague, fetchPlatformLeagues, setPlatformLeagueStatus, type PlatformLeague } from '@/lib/services/leagueService';
import { DeleteLeagueSheet } from '@/components/league/DeleteLeagueSheet';
import { CALCETTARI_LEAGUE_ID } from '@/types/league';
import { PlatformAdminsCard } from '@/components/platform/PlatformAdminsCard';

/**
 * Platform console (menu → "Console piattaforma"), for platform roles only:
 *  - SUPER_ADMIN: every league (suspend / re-activate) and the platform admins (appoint / revoke);
 *  - GLOBAL_ADMIN: reads the leagues and their numbers, no destructive action.
 * Nobody enters other people's leagues from here.
 */
export default function SuperAdminPage() {
  const t = useTranslations('superAdmin');
  const { isPlatformSuperAdmin, isPlatformStaff, isLoading } = useAuth();
  const { locale } = useLocaleSetting();
  const [leagues, setLeagues] = useState<PlatformLeague[] | null | 'forbidden' | 'loading'>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PlatformLeague | null>(null);
  const td = useTranslations('league.delete');
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLeagues(await fetchPlatformLeagues());
  }, []);

  useEffect(() => {
    if (isLoading || !isPlatformStaff) return;
    let alive = true;
    fetchPlatformLeagues().then((res) => alive && setLeagues(res));
    return () => {
      alive = false;
    };
  }, [isLoading, isPlatformStaff]);

  const change = async (l: PlatformLeague) => {
    if (busy.current || !isPlatformSuperAdmin) return;
    const next = l.status === 'active' ? 'suspended' : 'active';
    if (!(await askConfirm(next === 'suspended' ? t('confirmSuspend', { name: l.name }) : t('confirmActivate', { name: l.name })))) return;
    busy.current = true;
    setBusyId(l.id);
    const ok = await setPlatformLeagueStatus(l.id, next);
    busy.current = false;
    setBusyId(null);
    if (!ok) return notify(t('changeFailed'));
    notify(next === 'suspended' ? t('doneSuspended', { name: l.name }) : t('doneActivated', { name: l.name }));
    await load();
  };

  const removeLeague = async (l: PlatformLeague, typedName: string) => {
    const res = await deletePlatformLeague(l.id, typedName);
    if (res !== 'ok') return res;
    setDeleting(null);
    notify(td('done', { name: l.name }));
    await load();
    return 'ok';
  };

  const date = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (isLoading) return <PageSkeleton />;
  if (!isPlatformStaff || leagues === 'forbidden') {
    return (
      <div className="max-w-md mx-auto bg-card rounded-2xl p-6 text-center space-y-3">
        <p className="text-sm text-secondary">{t('forbidden')}</p>
        <Link href="/" className={textLink}>
          {t('home')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <header className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-warning" aria-hidden="true" /> {t('title')}
        </h1>
        <p className="text-sm text-secondary max-w-2xl">{isPlatformSuperAdmin ? t('subtitle') : t('subtitleStaff')}</p>
      </header>

      {isPlatformSuperAdmin && <PlatformAdminsCard />}

      {leagues === 'loading' && (
        <p className="text-sm text-secondary flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('loading')}
        </p>
      )}
      {leagues === null && <p className="text-sm text-danger">{t('failed')}</p>}

      {Array.isArray(leagues) && (
        <section aria-label={t('title')} className="space-y-2">
          <p className="text-xs font-semibold text-muted">{t('count', { count: leagues.length })}</p>
          {leagues.length === 0 && <p className="text-sm text-secondary">{t('empty')}</p>}
          <ul className="space-y-2">
            {leagues.map((l) => (
              <li key={l.id} className="bg-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3" aria-label={l.name}>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-primary truncate">{l.name}</h2>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        l.status === 'active' ? 'border-accent/30 bg-accent/15 text-accent-text' : 'border-rose-500/30 bg-rose-500/10 text-danger'
                      }`}
                    >
                      {l.status === 'active' ? t('active') : t('suspended')}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l.visibility === 'public' ? t('public') : t('private')}</span>
                  </div>
                  <p className="text-xs text-secondary">
                    {t('members', { count: l.members })} · {t('guests', { count: l.guests })} · {t('created', { date: date(l.createdAt) })}
                  </p>
                </div>
                {isPlatformSuperAdmin && (
                <button
                  type="button"
                  onClick={() => change(l)}
                  disabled={busyId !== null}
                  className={l.status === 'active' ? btnInline.danger : btnInline.primary}
                >
                  {busyId === l.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : l.status === 'active' ? (
                    <Ban className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  )}
                  {l.status === 'active' ? t('suspend') : t('activate')}
                </button>
                )}
                {isPlatformSuperAdmin && l.id !== CALCETTARI_LEAGUE_ID && (
                  <button type="button" onClick={() => setDeleting(l)} disabled={busyId !== null} className={btnInline.danger}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" /> {td('short')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {deleting && (
        <DeleteLeagueSheet leagueName={deleting.name} onDelete={(typed) => removeLeague(deleting, typed)} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
