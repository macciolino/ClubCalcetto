'use client';

import React, { useEffect, useState } from 'react';
import { Match } from '@/types/database';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';

/** How many matches the form tracker shows (fixed slots). */
export const FORM_SLOTS = 5;

/** The club's last `n` archived matches, oldest first (newest on the right of the tracker). */
export function lastCompletedMatches(completedMatches: Match[], n = FORM_SLOTS): Match[] {
  return [...completedMatches]
    .filter((m) => m.status === 'completed')
    .sort((a, b) => (b.match_date || b.id).localeCompare(a.match_date || a.id))
    .slice(0, n)
    .reverse();
}

type Slot =
  | { kind: 'won' | 'drawn' | 'lost'; label: string }
  | { kind: 'absent'; label: string }
  | { kind: 'empty'; label: string };

const shortDate = (d: string, locale: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  if (!y) return d;
  return new Date(y, m - 1, dd).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short' }).replace('.', '');
};

type FormT = ReturnType<typeof useTranslations<'formDots'>>;

function slotsFor(playerId: string, matches: Match[], t: FormT, locale: string): Slot[] {
  const slots: Slot[] = matches.map((m) => {
    const date = shortDate(m.match_date || m.id, locale);
    const inWhite = m.team_white?.some((p) => p.id === playerId);
    const inBlack = m.team_black?.some((p) => p.id === playerId);
    if (!inWhite && !inBlack) return { kind: 'absent', label: t('absent', { date }) };
    const mine = (inWhite ? m.score_white : m.score_black) ?? 0;
    const theirs = (inWhite ? m.score_black : m.score_white) ?? 0;
    const kind = mine === theirs ? 'drawn' : mine > theirs ? 'won' : 'lost';
    return { kind, label: t(kind, { score: `${mine}-${theirs}`, date }) };
  });
  // Meno di 5 partite nello storico: slot vuoti all'inizio
  while (slots.length < FORM_SLOTS) slots.unshift({ kind: 'empty', label: t('none') });
  return slots;
}

const DOT: Record<Slot['kind'], string> = {
  won: 'bg-emerald-500', // #10B981
  drawn: 'bg-amber-500', // #F59E0B
  lost: 'bg-red-500', // #EF4444
  absent: 'bg-slate-700', // #334155
  empty: 'bg-slate-700', // #334155, come le assenze
};

/** True when the player played at least one of the given matches. */
export function playedAny(playerId: string, matches: Match[]): boolean {
  return matches.some((m) => m.team_white?.some((p) => p.id === playerId) || m.team_black?.some((p) => p.id === playerId));
}

/**
 * Form tracker: always 5 dots for the club's last 5 archived matches (oldest → newest).
 * Green won, amber drawn, red lost, dark grey = absent or no match yet.
 * size 'sm' (8px, lists and Home) or 'md' (10px, player detail).
 * interactive (default): tap or hover a dot for a short summary ("Vinta 6-4 · 11 nov");
 * interactive={false}: plain dots, for use inside a clickable card.
 */
export function FormDots({
  playerId,
  matches,
  className = '',
  size = 'sm',
  interactive = true,
}: {
  playerId: string;
  matches: Match[];
  className?: string;
  size?: 'sm' | 'md';
  interactive?: boolean;
}) {
  const t = useTranslations('formDots');
  const { locale } = useLocaleSetting();
  const slots = slotsFor(playerId, matches.slice(-FORM_SLOTS), t, locale);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const t = setTimeout(() => setOpen(null), 2500);
    return () => clearTimeout(t);
  }, [open]);

  const dot = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2';

  if (!interactive) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`} role="img" aria-label={t('summary', { list: slots.map((s) => s.label).join('; ') })}>
        {slots.map((s, i) => (
          <span key={i} className={`block rounded-full ${dot} ${DOT[s.kind]}`} />
        ))}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${size === 'md' ? 'gap-0.5' : 'gap-0'} ${className}`} role="list" aria-label={t('listAria')}>
      {slots.map((s, i) => (
        <span key={i} role="listitem" className="relative">
          <button
            type="button"
            aria-label={s.label}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => (o === i ? null : i));
            }}
            onMouseEnter={() => setOpen(i)}
            onMouseLeave={() => setOpen((o) => (o === i ? null : o))}
            className="p-1 -m-0.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <span className={`block rounded-full ${dot} ${DOT[s.kind]}`} />
          </button>
          {open === i && (
            <span
              role="tooltip"
              className={`absolute bottom-full mb-1.5 z-30 whitespace-nowrap rounded-md bg-white ring-1 ring-line-strong px-2 py-1 text-[11px] font-semibold text-slate-950 shadow-lg animate-in pointer-events-none ${
                i === 0 ? 'left-0' : i === slots.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
              }`}
            >
              {s.label}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
