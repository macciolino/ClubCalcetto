import React from 'react';
import { STAT_DETAILS } from '@/types/database';

interface StatBarsProps {
  /** Parameter values written in the player's card (1..10), already in display order */
  stats: { name: string; value: number }[];
  /** "Stato forma" added to every parameter (can be negative) */
  form?: number;
  compact?: boolean;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Parameters as bars 1-10 (easier to compare than numbers). With a form bonus the extra part is lighter green,
 * with a malus the lost part is shown faded: you see what comes from the card and what from the form.
 */
export function StatBars({ stats, form = 0, compact = false }: StatBarsProps) {
  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {stats.map(({ name, value }) => {
        const final = Math.max(1, Math.min(10, value + form));
        const low = Math.min(value, final);
        const high = Math.max(value, final);
        const label = STAT_DETAILS[name]?.name || name;
        return (
          <li key={name} className="flex items-center gap-2.5">
            <span className={`w-20 flex-shrink-0 truncate text-slate-300 ${compact ? 'text-[11px]' : 'text-xs'}`} title={label}>
              {label}
            </span>
            <span
              className="relative flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
              role="img"
              aria-label={`${label}: ${fmt(final)} su 10`}
            >
              <span className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${low * 10}%` }} />
              {high > low && (
                <span
                  className={`absolute inset-y-0 rounded-r-full ${form > 0 ? 'bg-emerald-300' : 'bg-sky-400/30'}`}
                  style={{ left: `${low * 10}%`, width: `${(high - low) * 10}%` }}
                />
              )}
            </span>
            <span className={`w-7 text-right tabular-nums font-semibold text-white ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {fmt(final)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
