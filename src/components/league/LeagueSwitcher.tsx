'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Lock, Plus, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { menu } from '@/components/ui/buttons';
import { notify } from '@/components/ui/Feedback';
import { useActiveLeague, type LeagueSummary } from '@/lib/context/ActiveLeagueContext';
import { CreateLeagueSheet } from '@/components/league/CreateLeagueSheet';
import type { LeagueRole } from '@/types/league';

/** Role badge in the active league: semantic tokens, readable on light and dark cards. */
export function LeagueRoleBadge({ role, platform }: { role: LeagueRole | null; platform?: 'SUPER_ADMIN' | 'GLOBAL_ADMIN' | null }) {
  const t = useTranslations('league.roles');
  const ts = useTranslations('superAdmin.staff');
  // Platform staff act as president everywhere: without a card here, or with a plain player / collaborator card,
  // the platform role is the one that counts (the card's role is shown only when it is the president's)
  if (platform && role !== 'PRESIDENT')
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap bg-amber-500/15 text-warning border-amber-500/30">
        {platform === 'SUPER_ADMIN' ? ts('roleSuper') : ts('roleGlobal')}
      </span>
    );
  if (!role) return null;
  const tone =
    role === 'PRESIDENT'
      ? 'bg-amber-500/15 text-warning border-amber-500/30'
      : role === 'COLLABORATOR'
        ? 'bg-accent/15 text-accent-text border-accent/30'
        : 'bg-card-hover text-secondary border-line-strong';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${tone}`}>{t(role)}</span>;
}

/**
 * Public or private: who can find the league. Public = on the welcome screen of everyone with no league, they join
 * directly; private = only with the invite link. An icon in the header (the word too from sm), the full sentence as hint.
 */
export function LeagueVisibilityBadge({ visibility, compact = false }: { visibility: 'public' | 'private' | null; compact?: boolean }) {
  const t = useTranslations('league.visibility');
  if (!visibility) return null;
  const Icon = visibility === 'public' ? Globe : Lock;
  const tone = visibility === 'public' ? 'text-accent-text border-accent/30 bg-accent/10' : 'text-secondary border-line-strong bg-card-hover';
  return (
    <span
      title={t(`${visibility}Hint`)}
      aria-label={t(visibility)}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${tone}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {!compact && <span className="hidden sm:inline">{t(visibility)}</span>}
    </span>
  );
}

/**
 * Multi-league step 2: active league next to the logo ("I Calcettari" + role). Tap = list of the user's leagues
 * (bottom sheet on phone and tablet, popover on desktop ≥ 1024px) + "Crea nuova lega".
 */
export function LeagueSwitcher() {
  const t = useTranslations('league');
  const { leagues, activeLeagueId, setActiveLeague, leagueRole, isSuperAdmin, isPlatformStaff, activeVisibility } = useActiveLeague();
  const staffRole = isSuperAdmin ? 'SUPER_ADMIN' : isPlatformStaff ? 'GLOBAL_ADMIN' : null;
  const [open, setOpen] = useState<'popover' | 'sheet' | null>(null);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = leagues.find((l) => l.id === activeLeagueId);

  useEffect(() => {
    if (open !== 'popover') return;
    const onDown = (e: MouseEvent | TouchEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!active) return null;

  const toggle = () => {
    if (open) return setOpen(null);
    const desktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
    setOpen(desktop ? 'popover' : 'sheet');
  };
  const choose = (l: LeagueSummary) => {
    setOpen(null);
    if (l.id === activeLeagueId) return;
    setActiveLeague(l.id);
    notify(t('switched', { name: l.name }));
  };
  const startCreate = () => {
    setOpen(null);
    setCreating(true);
  };

  const list = (
    <div role="menu" aria-label={t('yourLeagues')} className="space-y-0.5">
      {leagues.map((l) => (
        <button key={l.id} type="button" role="menuitemradio" aria-checked={l.id === activeLeagueId} onClick={() => choose(l)} className={menu.item}>
          <Shield className="h-4 w-4 text-accent-text shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left truncate">{l.name}</span>
          {l.id === activeLeagueId && <Check className="h-4 w-4 text-accent-text" aria-label={t('current')} />}
        </button>
      ))}
      <div className={menu.divider} />
      <button type="button" role="menuitem" onClick={startCreate} className={menu.item}>
        <Plus className="h-4 w-4 text-accent-text" aria-hidden="true" /> {t('createNew')}
      </button>
    </div>
  );

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-label={`${t('switcherLabel', { name: active.name })}${activeVisibility ? ` (${t(`visibility.${activeVisibility}`)})` : ''}`}
        className="flex items-center gap-1.5 min-w-0 max-w-[7.75rem] min-[360px]:max-w-[9.5rem] min-[400px]:max-w-[12.5rem] sm:max-w-[22rem] rounded-full border border-line-strong bg-card/60 pl-3 pr-2 py-1 hover:bg-card-hover transition-colors"
      >
        <span className="truncate text-sm font-semibold text-primary">{active.name}</span>
        <LeagueVisibilityBadge visibility={activeVisibility} />
        <span className="hidden sm:inline-flex">
          <LeagueRoleBadge role={leagueRole} platform={staffRole} />
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open === 'popover' && <div className={`${menu.panel} absolute left-0 mt-2 w-72 z-50`}>{list}</div>}
      {open === 'sheet' && (
        <Sheet onClose={() => setOpen(null)} title={t('yourLeagues')} subtitle={<LeagueRoleBadge role={leagueRole} platform={staffRole} />}>
          {list}
        </Sheet>
      )}
      {creating && <CreateLeagueSheet onClose={() => setCreating(false)} />}
    </div>
  );
}
