'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, LinkIcon, Loader2, LogIn, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { btn, textLink } from '@/components/ui/buttons';
import { notify } from '@/components/ui/Feedback';
import { useAuth } from '@/lib/context/AuthContext';
import { useActiveLeague } from '@/lib/context/ActiveLeagueContext';
import { fetchJoinInfo, joinLeagueRequest, type JoinInfo } from '@/lib/services/leagueService';
import { clearReturnPath, setReturnPath } from '@/lib/utils/returnPath';
import { usePlayerLabels } from '@/i18n/usePlayerLabels';
import type { FieldPosition } from '@/types/database';

const NEW = '__new__';

/**
 * Multi-league step 3 — invite link `/join/{code}`.
 * Signed out: league name + "sign in or sign up" (comes back here afterwards).
 * Signed in: already a member → open the league; otherwise pick "that's me" among the ghost players
 * (takes over matches, goals, OVR) or "I am new" (a fresh card), then join.
 */
export default function JoinLeaguePage() {
  const t = useTranslations('league.join');
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { setActiveLeague } = useActiveLeague();
  const labels = usePlayerLabels();
  const [info, setInfo] = useState<JoinInfo | null | 'loading'>('loading');
  const [choice, setChoice] = useState<string>(NEW);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (isLoading) return;
    if (uid) clearReturnPath();
    let alive = true;
    fetchJoinInfo(String(code)).then((res) => alive && setInfo(res));
    return () => {
      alive = false;
    };
  }, [code, uid, isLoading]);

  const signIn = () => {
    setReturnPath(`/join/${code}`);
    router.push('/login');
  };
  const openLeague = (leagueId: string) => {
    setActiveLeague(leagueId);
    router.replace('/');
  };
  const join = async () => {
    if (sending.current || info === 'loading' || !info) return;
    sending.current = true;
    setJoining(true);
    setError('');
    const res = await joinLeagueRequest(String(code), choice === NEW ? null : choice);
    sending.current = false;
    setJoining(false);
    if ('error' in res) return setError(t(`errors.${res.error}`));
    notify(res.claimed ? t('claimed', { name: info.leagueName, player: res.claimed }) : t('joined', { name: info.leagueName }));
    openLeague(res.leagueId);
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[60vh] flex items-center justify-center">
      <section className="w-full max-w-md bg-card rounded-2xl p-6 space-y-4" aria-labelledby="join-title">
        <LinkIcon className="h-8 w-8 mx-auto text-accent-text" aria-hidden="true" />
        <h1 id="join-title" className="text-xl font-black text-primary text-center">
          {t('title')}
        </h1>
        {children}
      </section>
    </div>
  );

  if (info === 'loading' || isLoading) {
    return shell(
      <p className="text-sm text-secondary flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('loading')}
      </p>
    );
  }
  if (!info) {
    return shell(
      <div className="space-y-4 text-center">
        <p className="text-sm text-secondary">{t('invalid')}</p>
        <Link href="/" className={textLink}>
          {t('home')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const leagueLine = (
    <p className="text-center text-sm text-secondary">
      {t('invitedTo')} <strong className="block text-lg text-primary">{info.leagueName}</strong>
    </p>
  );

  if (!uid) {
    return shell(
      <div className="space-y-4">
        {leagueLine}
        <button type="button" onClick={signIn} className={`${btn.primary} sm:w-full`}>
          <LogIn className="h-4 w-4" aria-hidden="true" /> {t('signIn')}
        </button>
      </div>
    );
  }

  if (info.member && info.leagueId) {
    const leagueId = info.leagueId;
    return shell(
      <div className="space-y-4 text-center">
        {leagueLine}
        <p className="text-sm text-secondary">{t('already')}</p>
        <button type="button" onClick={() => openLeague(leagueId)} className={textLink}>
          {t('open')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const ghosts = info.ghosts || [];
  return shell(
    <div className="space-y-4">
      {leagueLine}
      {ghosts.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-primary">{t('whoAreYou')}</legend>
          <p className="text-xs text-secondary">{t('whoHint')}</p>
          <div role="radiogroup" className="space-y-1.5 max-h-72 overflow-y-auto">
            {[{ id: NEW, name: t('newPlayer'), position: null }, ...ghosts].map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={choice === g.id}
                onClick={() => setChoice(g.id)}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  choice === g.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-card-hover'
                }`}
              >
                {g.id === NEW && <UserPlus className="h-4 w-4 text-accent-text" aria-hidden="true" />}
                <span className="flex-1 text-sm font-semibold text-primary truncate">{g.name}</span>
                {g.position && <span className="text-xs text-secondary">{labels.position(g.position as FieldPosition)}</span>}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="button" onClick={join} disabled={joining} className={`${btn.primary} sm:w-full`}>
        {joining ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
        {joining ? t('joining') : t('join')}
      </button>
    </div>
  );
}
