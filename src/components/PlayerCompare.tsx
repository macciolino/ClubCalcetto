'use client';

import React, { useState } from 'react';
import { Profile, StatCategory } from '@/types/database';
import { getStatValue } from '@/lib/utils/statUtils';
import { RadarChart } from '@/components/RadarChart';
import { Sheet } from '@/components/ui/Sheet';

interface PlayerCompareProps {
  players: Profile[];
  categories: StatCategory[];
  initialA?: string;
  onClose: () => void;
}

/**
 * Two players side by side: overlapping radars (green and blue) and the parameters next to each other.
 * Bottom sheet on phone/tablet, centred modal on desktop (see components/ui/Sheet).
 */
export function PlayerCompare({ players, categories, initialA, onClose }: PlayerCompareProps) {
  const sorted = [...players].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const [aId, setAId] = useState(initialA || sorted[0]?.id || '');
  const [bId, setBId] = useState(sorted.find((p) => p.id !== (initialA || sorted[0]?.id))?.id || '');
  const a = players.find((p) => p.id === aId);
  const b = players.find((p) => p.id === bId);

  const statsOf = (p?: Profile) => {
    const out: Record<string, number> = {};
    categories.forEach((c) => (out[c.name] = getStatValue(p?.stats, c.name, c.default_value ?? 6)));
    return out;
  };
  const sa = statsOf(a);
  const sb = statsOf(b);

  const select = (value: string, onChange: (v: string) => void, color: string, label: string) => (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-0 bg-slate-950 border-2 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none ${color}`}
      >
        {sorted.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Sheet onClose={onClose} size="lg" height="tall" title="Confronta giocatori">
      <div className="grid grid-cols-2 gap-3">
        {select(aId, setAId, 'border-emerald-500', 'Primo giocatore')}
        {select(bId, setBId, 'border-sky-500', 'Secondo giocatore')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-center">
        {/* Radar sovrapposti */}
        <div className="flex flex-col items-center">
          <RadarChart stats={sa} overlay={{ stats: sb, kind: 'compare' }} size={260} color="emerald" showLabels showValues={false} />
          <div className="flex items-center gap-4 text-xs text-slate-300 max-w-full">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{a?.full_name}</span>
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{b?.full_name}</span>
            </span>
          </div>
        </div>

        {/* Valori a confronto */}
        <ul className="space-y-1.5 text-sm rounded-xl bg-slate-950/50 p-3">
          {categories.map((c) => {
            const va = sa[c.name];
            const vb = sb[c.name];
            return (
              <li key={c.name} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 py-0.5">
                <span className={`text-right tabular-nums font-semibold ${va > vb ? 'text-emerald-300' : 'text-slate-400'}`}>{va}</span>
                <span className="text-center text-slate-400 truncate">{c.name}</span>
                <span className={`tabular-nums font-semibold ${vb > va ? 'text-sky-300' : 'text-slate-400'}`}>{vb}</span>
              </li>
            );
          })}
          <li className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 pt-2 mt-1 border-t border-slate-800">
            <span className="text-right tabular-nums font-bold text-white">{a?.overall_rating ?? '-'}</span>
            <span className="text-center text-slate-400">OVR</span>
            <span className="tabular-nums font-bold text-white">{b?.overall_rating ?? '-'}</span>
          </li>
        </ul>
      </div>
    </Sheet>
  );
}
