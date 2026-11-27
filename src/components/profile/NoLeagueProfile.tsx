'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/context/AuthContext';
import { surface } from '@/components/ui/surfaces';
import { uploadedPhoto, initialsOf } from '@/lib/utils/playerUtils';
import { CareerCard } from '@/components/profile/CareerCard';

/**
 * Profilo of an account that belongs to no league: what is the person's own on the platform — who they are, the global
 * radar (Radar Base, editable, and the ratings received as a guest) and the career of the matches played as a guest
 * from the board, with their statistics. The league's parts (its radar, its records) come when they join one.
 */
export function NoLeagueProfile() {
  const t = useTranslations('profile.noLeague');
  const { user, profile } = useAuth();
  if (!profile) return null;
  const photo = uploadedPhoto(profile.avatar_url);

  return (
    <div className="space-y-6 pb-12">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">{t('title')}</h1>
        <p className="text-sm text-secondary mt-1">{t('subtitle')}</p>
      </header>

      <section aria-label={t('identity')} className={`${surface.card} p-5 flex items-center gap-4`}>
        {photo ? (
          <img src={photo} alt="" className="h-16 w-16 rounded-2xl object-cover" />
        ) : (
          <span className="h-16 w-16 rounded-2xl bg-card-hover border border-line-strong dark:border-line-strong/60 flex items-center justify-center text-2xl font-bold text-accent-text">
            {initialsOf(profile.full_name || '?')}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-lg font-bold text-primary truncate">{profile.full_name}</span>
          {user?.email && <span className="block text-sm text-secondary truncate">{user.email}</span>}
          <span className="block text-xs text-muted mt-1">{t('noLeague')}</span>
        </span>
      </section>

      <CareerCard profileId={profile.id} showRadar baseRadar={profile.baseRadar} />
    </div>
  );
}
