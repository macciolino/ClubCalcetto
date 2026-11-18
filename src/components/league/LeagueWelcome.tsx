'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LinkIcon, LogOut, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BrandLogo } from '@/components/BrandLogo';
import { btn } from '@/components/ui/buttons';
import { useAuth } from '@/lib/context/AuthContext';
import { inviteCodeFrom } from '@/lib/services/leagueService';
import { CreateLeagueSheet } from '@/components/league/CreateLeagueSheet';

/** Multi-league step 2: a signed-in account that belongs to no league. Create one, or join with an invite. */
export function LeagueWelcome() {
  const t = useTranslations('league.welcome');
  const router = useRouter();
  const { signOut } = useAuth();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = inviteCodeFrom(code);
    if (!c) return setError(t('badCode'));
    router.push(`/join/${c}`);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-8">
      <section aria-labelledby="welcome-title" className="w-full max-w-md bg-card rounded-2xl p-6 sm:p-8 space-y-6 text-center">
        <div className="flex justify-center">
          <BrandLogo />
        </div>
        <div className="space-y-2">
          <h1 id="welcome-title" className="text-2xl font-black text-primary">
            {t('title')}
          </h1>
          <p className="text-sm text-secondary">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setCreating(true)} className={`${btn.primary} sm:w-full`}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {t('create')}
          </button>
          <button type="button" onClick={() => setJoining((v) => !v)} aria-expanded={joining} className={`${btn.secondary} sm:w-full`}>
            <LinkIcon className="h-4 w-4" aria-hidden="true" /> {t('join')}
          </button>
        </div>
        {joining && (
          <form onSubmit={join} className="space-y-2 text-left">
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
        <button type="button" onClick={() => signOut()} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-secondary">
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> {t('logout')}
        </button>
      </section>
      {creating && <CreateLeagueSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
