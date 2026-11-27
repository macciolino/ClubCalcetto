'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { surface } from '@/components/ui/surfaces';
import { PublicLeagueList, usePublicLeagues } from '@/components/league/PublicLeagues';

/** Lower case, no accents: "Lunedì" is found with "lunedi". */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * "Leghe pubbliche": every active public league the account is not in yet, with a search bar on top; tapping one joins it
 * (after a confirmation). Open with or without a league (docs/ARCHITECTURE.md §3.1).
 */
export default function PublicLeaguesPage() {
  const { user, profile, isLoading } = useAuth();
  // The list is asked for only once signed in (the server needs the account's token)
  if (isLoading || !user || !profile) return <PageSkeleton />;
  return <PublicLeaguesContent />;
}

function PublicLeaguesContent() {
  const t = useTranslations('publicLeagues');
  const { leagues, busy, join } = usePublicLeagues();
  const [query, setQuery] = useState('');
  const router = useRouter();
  // Joined: the new league becomes the active one, its Home opens
  const onJoin = async (l: Parameters<typeof join>[0]) => {
    if (await join(l)) router.push('/');
  };

  const filtered = useMemo(() => {
    if (!Array.isArray(leagues)) return leagues;
    const q = norm(query);
    return q ? leagues.filter((l) => norm(l.name).includes(q)) : leagues;
  }, [leagues, query]);

  const searching = Boolean(query.trim());

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-12">
      <header className="space-y-1">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-accent-text">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('back')}
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">{t('title')}</h1>
        <p className="text-sm text-secondary">{t('pageSubtitle')}</p>
      </header>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          className={`w-full rounded-full ${surface.control} bg-card pl-10 pr-10 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent`}
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t('clearSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-muted hover:text-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {Array.isArray(leagues) && leagues.length > 0 && (
        <p className="text-xs text-secondary" aria-live="polite">
          {searching ? t('found', { count: Array.isArray(filtered) ? filtered.length : 0 }) : t('total', { count: leagues.length })}
        </p>
      )}

      <PublicLeagueList
        leagues={filtered}
        busy={busy}
        onJoin={onJoin}
        emptyText={Array.isArray(leagues) && leagues.length > 0 ? t('noMatch', { query: query.trim() }) : t('none')}
      />
    </div>
  );
}
