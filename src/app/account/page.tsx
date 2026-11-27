'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { surface } from '@/components/ui/surfaces';
import { RadarBaseCard } from '@/components/account/RadarBaseCard';
import { LanguageSetting } from '@/components/settings/LanguageSetting';
import { ThemeSetting } from '@/components/settings/ThemeSetting';
import { BoardSetting } from '@/components/settings/BoardSetting';
import { NotificationGuide } from '@/components/NotificationGuide';
import { AccountSettings } from '@/components/AccountSettings';

/**
 * "Il mio account": everything that belongs to the PERSON, not to a league, so it is reachable also by an account that
 * belongs to no league (the other pages are the league's): Radar Base, language, theme, board, notifications on this
 * device, sign-out and closing the account. docs/ARCHITECTURE.md §3.1.
 */
export default function AccountPage() {
  const t = useTranslations('accountPage');
  const { user, profile, isLoading } = useAuth();
  if (isLoading || !user || !profile) return <PageSkeleton />;

  return (
    <div className="space-y-6 pb-16 max-w-2xl">
      <header className="space-y-1">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-accent-text" aria-label={t('backAria')}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('back')}
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">{t('title')}</h1>
        <p className="text-sm text-secondary">{t('subtitle')}</p>
      </header>

      <RadarBaseCard />

      <section aria-label={t('preferences')} className="space-y-1.5">
        <h2 className="px-1 text-xs font-semibold text-muted">{t('preferences')}</h2>
        <div className={`${surface.card} overflow-hidden divide-y divide-line`}>
          <LanguageSetting />
          <ThemeSetting />
          <BoardSetting />
        </div>
      </section>

      <section aria-label={t('notifications')} className="space-y-1.5">
        <h2 className="px-1 text-xs font-semibold text-muted">{t('notifications')}</h2>
        <NotificationGuide />
      </section>

      <section aria-label={t('account')} className="space-y-1.5">
        <h2 className="px-1 text-xs font-semibold text-muted">{t('account')}</h2>
        <AccountSettings />
      </section>
    </div>
  );
}
