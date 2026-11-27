'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LinkIcon, LogOut, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrandLogo } from '@/components/BrandLogo';
import { btn, textLink } from '@/components/ui/buttons';
import { useAuth } from '@/lib/context/AuthContext';
import { inviteCodeFrom } from '@/lib/services/leagueService';
import { CreateLeagueSheet } from '@/components/league/CreateLeagueSheet';
import { PublicLeagues } from '@/components/league/PublicLeagues';
import { BaseRadarStep } from '@/components/onboarding/BaseRadarStep';
import { CareerCard } from '@/components/profile/CareerCard';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { subscribeMySpots } from '@/lib/services/matchNoticeService';

/**
 * A signed-in account that belongs to no league. A NEW account first sets its Radar Base; then it explores the public
 * leagues (clickable cards), creates a league, joins with an invite or looks at the board for spot matches.
 */
export function LeagueWelcome() {
  const t = useTranslations('league.welcome');
  const router = useRouter();
  const { signOut, profile } = useAuth();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  // Who played matches as an external (board "Cerco giocatore") finds that career here: they have no league, so no Profile
  const [hasSpots, setHasSpots] = useState(false);
  const profileId = profile?.id;
  useEffect(() => {
    if (!isFirebaseConfigured || !profileId) return;
    return subscribeMySpots(profileId, (spots) => setHasSpots(spots.length > 0));
  }, [profileId]);

  // The Radar Base comes before everything else
  if (profile?.base_radar_pending === true) return <div className="py-8"><BaseRadarStep /></div>;

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = inviteCodeFrom(code);
    if (!c) return setError(t('badCode'));
    router.push(`/join/${c}`);
  };

  return (
    <div className="min-h-[70vh] flex items-start justify-center py-8">
      <div className="w-full max-w-3xl space-y-6">
        <header className="space-y-3 text-center">
          <div className="flex justify-center">
            <BrandLogo />
          </div>
          <h1 id="welcome-title" className="text-2xl font-black text-primary">
            {t('title')}
          </h1>
          <p className="text-sm text-secondary max-w-xl mx-auto">{t('subtitle')}</p>
        </header>

        <PublicLeagues />

        <section aria-labelledby="welcome-title" className="w-full rounded-2xl border border-line-strong dark:border-line-strong/60 bg-card p-5 sm:p-6 space-y-4 text-center">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => setCreating(true)} className={btn.primary}>
              <Plus className="h-4 w-4" aria-hidden="true" /> {t('create')}
            </button>
            <button type="button" onClick={() => setJoining((v) => !v)} aria-expanded={joining} className={btn.secondary}>
              <LinkIcon className="h-4 w-4" aria-hidden="true" /> {t('join')}
            </button>
          </div>
          {joining && (
            <form onSubmit={join} className="space-y-2 text-left max-w-md mx-auto">
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
                  className="flex-1 min-w-0 rounded-xl border border-line bg-app px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent"
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
          {/* "Cerco giocatore": partite di altre leghe da giocare anche senza farne parte */}
          <div>
            <Link href="/board" className={textLink}>
              {t('board')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <button type="button" onClick={() => signOut()} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-secondary">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> {t('logout')}
          </button>
        </section>

        {hasSpots && profileId && <CareerCard profileId={profileId} />}
      </div>
      {creating && <CreateLeagueSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
