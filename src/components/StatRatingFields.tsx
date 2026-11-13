'use client';

import React from 'react';
import { StatCategory, STAT_DETAILS, sortStatsByCanonicalOrder } from '@/types/database';

/** Average of the values, 1 decimal (same OVR formula as the player editor). */
export function ovrOf(stats: Record<string, number>): number {
  const values = Object.values(stats);
  if (!values.length) return 6;
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));
}

/** Categories in the usual order (VEL, FIS, RES, …). */
export function orderedCategories(categories: StatCategory[]): StatCategory[] {
  const order = sortStatsByCanonicalOrder(categories.map((c) => c.name));
  return order.map((n) => categories.find((c) => c.name === n)!).filter(Boolean);
}

/**
 * One slider 1–10 per player parameter, with code, name and value.
 * `reference` (optional) shows a second value under the name, e.g. the player's self-assessment for the admin.
 */
export function StatRatingFields({
  categories,
  values,
  onChange,
  reference,
  referenceLabel = 'Autovalutazione',
  showHelp = false,
  disabled = false,
}: {
  categories: StatCategory[];
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  reference?: Record<string, number>;
  referenceLabel?: string;
  showHelp?: boolean;
  disabled?: boolean;
}) {
  return (
    <ul className="space-y-4">
      {orderedCategories(categories).map((cat) => {
        const d = STAT_DETAILS[cat.name];
        const value = Number(values[cat.name] ?? cat.default_value ?? 6);
        const ref = reference?.[cat.name];
        const id = `stat-${cat.name}`;
        return (
          <li key={cat.name} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={id} className="min-w-0">
                <span className="text-[11px] font-semibold tracking-wider text-muted mr-1.5">{d?.code || cat.name.slice(0, 3).toUpperCase()}</span>
                <span className="text-sm font-medium text-primary">{cat.name}</span>
                {ref !== undefined && (
                  <span className="block text-xs text-muted">
                    {referenceLabel}: <span className="text-secondary tabular-nums">{ref}</span>
                  </span>
                )}
              </label>
              <span className={`text-lg font-semibold tabular-nums ${value >= 8 ? 'text-accent-text' : value >= 6 ? 'text-primary' : 'text-secondary'}`}>
                {value}
              </span>
            </div>
            <input
              id={id}
              type="range"
              min={1}
              max={10}
              step={1}
              value={value}
              disabled={disabled}
              onChange={(e) => onChange({ ...values, [cat.name]: Number(e.target.value) })}
              className="w-full accent-emerald-500 h-2 cursor-pointer disabled:opacity-50"
              aria-valuetext={`${cat.name} ${value} su 10`}
            />
            {showHelp && d?.description && <p className="text-xs text-muted leading-relaxed">{d.description}</p>}
          </li>
        );
      })}
    </ul>
  );
}
