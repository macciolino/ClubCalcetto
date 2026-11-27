'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, BarChart3, CalendarCheck, Check, LinkIcon, Megaphone, Plus, Shuffle } from 'lucide-react';
import { btn, textLink } from '@/components/ui/buttons';
import { surface } from '@/components/ui/surfaces';
import { useAuth } from '@/lib/context/AuthContext';
import { inviteCodeFrom } from '@/lib/services/leagueService';
import { CreateLeagueSheet } from '@/components/league/CreateLeagueSheet';
import { PublicLeagues } from '@/components/league/PublicLeagues';
import { BaseRadarStep } from '@/components/onboarding/BaseRadarStep';
import { useCareer } from '@/lib/hooks/useCareer';
import { cleanBaseRadar, radarOverall } from '@/lib/utils/baseRadar';

/**
 * Entry screen of a signed-in account that belongs to no league (docs/ARCHITECTURE.md §3.1). One page, top to bottom:
 * what the app does and the first actions (create a league, use an invite, find a match), the public leagues, what you
 * can do, how to start (3 steps, the first ticks itself once the Radar Base is saved), and the person's profile in short.
 * A NEW account first sets its Radar Base. Phone: one column; PC: the same blocks side by side.
 */
export function LeagueWelcome() {
  const t = useTranslations('league.welcome');
  const router = useRouter();
  const { profile } = useAuth();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // The Radar Base comes before everything else
  if (profile?.base_radar_pending === true) return <div className="py-8"><BaseRadarStep /></div>;

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = inviteCodeFrom(code);
    if (!c) return setError(t('badCode'));
    router.push(`/join/${c}`);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10 pb-12">
      {/* 1. Cosa fa l'app e le prime azioni */}
      <section aria-labelledby="welcome-title" className="pt-2 text-center space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-text">{t('eyebrow')}</p>
          <h1 id="welcome-title" className="text-3xl sm:text-4xl font-black tracking-tight text-primary text-balance">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto max-w-xl text-base text-secondary">{t('heroSubtitle')}</p>
        </div>
        <div className="mx-auto flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <button type="button" onClick={() => setCreating(true)} className={btn.primary}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('create')}
          </button>
          <button type="button" onClick={() => setJoining((v) => !v)} aria-expanded={joining} className={btn.secondary}>
            <LinkIcon className="h-4 w-4" aria-hidden="true" /> {t('invite')}
          </button>
        </div>
        {joining && (
          <form onSubmit={join} className={`${surface.card} mx-auto max-w-md p-4 space-y-2 text-left`}>
            <label htmlFor="invite-code" className="text-xs font-semibold text-secondary">
              {t('codeLabel')}
            </label>
            <div className="flex gap-2">
              <input
                id="invite-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError('');
                }}
                placeholder={t('codePlaceholder')}
                className="flex-1 min-w-0 rounded-xl border border-line-strong dark:border-line-strong/60 bg-app px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <button type="submit" disabled={!code.trim()} className="inline-flex items-center justify-center px-4 rounded-xl bg-accent text-on-accent text-sm font-semibold disabled:opacity-50">
                {t('go')}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </form>
        )}
        <Link href="/board" className={textLink}>
          {t('board')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      {/* 2. Leghe pubbliche: l'azione più utile, subito */}
      <PublicLeagues />

      {/* 3. Cosa puoi fare */}
      <Features />

      {/* 4. Come si inizia */}
      <Steps radarDone={Boolean(cleanBaseRadar(profile?.baseRadar))} />

      {/* 5. Il tuo profilo, in breve */}
      {profile && <ProfileSummary profileId={profile.id} baseRadar={profile.baseRadar} />}

      {creating && <CreateLeagueSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

const FEATURES = [
  { key: 'attendance', Icon: CalendarCheck },
  { key: 'teams', Icon: Shuffle },
  { key: 'stats', Icon: BarChart3 },
  { key: 'board', Icon: Megaphone },
] as const;

function Features() {
  const t = useTranslations('league.welcome');
  return (
    <section aria-labelledby="features-title" className="space-y-3">
      <h2 id="features-title" className="text-lg font-bold text-primary">
        {t('featuresTitle')}
      </h2>
      <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {FEATURES.map(({ key, Icon }) => (
          <li key={key} className={`${surface.card} p-3.5 sm:p-4 space-y-2`}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent-text">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="text-sm font-semibold text-primary">{t(`features.${key}.title`)}</h3>
            <p className="text-xs sm:text-sm text-secondary leading-relaxed">{t(`features.${key}.text`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps({ radarDone }: { radarDone: boolean }) {
  const t = useTranslations('league.welcome');
  const steps = [
    { key: 'radar', done: radarDone, href: '/profile' },
    { key: 'league', done: false },
    { key: 'play', done: false },
  ] as const;
  return (
    <section aria-labelledby="steps-title" className="space-y-3">
      <h2 id="steps-title" className="text-lg font-bold text-primary">
        {t('stepsTitle')}
      </h2>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key} className={`${surface.card} p-4 flex gap-3`}>
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                s.done ? 'bg-accent text-on-accent' : 'border border-line-strong dark:border-line-strong/60 text-secondary'
              }`}
              aria-label={s.done ? t('stepDone') : undefined}
            >
              {s.done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span className="min-w-0 space-y-1">
              <span className="block text-sm font-semibold text-primary">{t(`steps.${s.key}.title`)}</span>
              <span className="block text-sm text-secondary leading-relaxed">{t(`steps.${s.key}.text`)}</span>
              {s.key === 'radar' && (
                <Link href="/profile" className="inline-flex items-center gap-1 text-xs font-semibold text-accent-text hover:opacity-80">
                  {s.done ? t('steps.radar.edit') : t('steps.radar.set')} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProfileSummary({ profileId, baseRadar }: { profileId: string; baseRadar: unknown }) {
  const t = useTranslations('league.welcome');
  const career = useCareer(profileId);
  const radar = useMemo(() => cleanBaseRadar(baseRadar), [baseRadar]);
  const ext = career?.summary.external;
  const won = career?.summary.totals.won ?? 0;
  const stat = (value: React.ReactNode, label: string, wide = false) => (
    <div className={`${surface.inset} px-3 py-2.5 text-center ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
      <div className="text-xl font-bold text-primary tabular-nums">{value}</div>
      <div className="text-[11px] text-secondary">{label}</div>
    </div>
  );

  return (
    <section aria-labelledby="summary-title" className={`${surface.card} p-5 space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="summary-title" className="text-lg font-bold text-primary">
          {t('profileTitle')}
        </h2>
        <p className="text-xs text-secondary">{t('profileHint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stat(radar ? Math.round(radarOverall(radar) * 10) : '—', radar ? t('radarOvr') : t('radarNotSet'), true)}
        {stat(ext?.played ?? 0, t('guestPlayed'))}
        {stat(won, t('guestWon'))}
        {stat(ext?.goals ?? 0, t('guestGoals'))}
        {stat(ext?.mvp ?? 0, t('guestMvp'))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href="/profile" className={textLink}>
          {t('goProfile')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link href="/settings" className={textLink}>
          {t('goSettings')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
