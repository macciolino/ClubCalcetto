'use client';

import React, { useEffect, useState } from 'react';
import { Profile, StatCategory } from '@/types/database';
import { getStatValue } from '@/lib/utils/statUtils';
import { RadarChart } from '@/components/RadarChart';
import { X } from 'lucide-react';

interface PlayerCompareProps {
  players: Profile[];
  categories: StatCategory[];
  initialA?: string;
  onClose: () => void;
}

/** Two players side by side: overlapping radars (green and blue) and the parameters next to each other. */
export function PlayerCompare({ players, categories, initialA, onClose }: PlayerCompareProps) {
  const sorted = [...players].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const [aId, setAId] = useState(initialA || sorted[0]?.id || '');
  const [bId, setBId] = useState(sorted.find((p) => p.id !== (initialA || sorted[0]?.id))?.id || '');
  const a = players.find((p) => p.id === aId);
  const b = players.find((p) => p.id === bId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const statsOf = (p?: Profile) => {
    const out: Record<string, number> = {};
    categories.forEach((c) => (out[c.name] = getStatValue(p?.stats, c.name, c.default_value ?? 6)));
    return out;
  };
  const sa = statsOf(a);
  const sb = statsOf(b);

  const select = (value: string, onChange: (v: string) => void, color: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full min-w-0 bg-slate-950 border rounded-xl px-3 py-2 text-sm text-white focus:outline-none ${color}`}
    >
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center modal-safe" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confronta giocatori"
        className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-2xl animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Confronta giocatori</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="p-2 -m-2 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {select(aId, setAId, 'border-emerald-500/60')}
          {select(bId, setBId, 'border-sky-500/60')}
        </div>

        <RadarChart stats={sa} overlay={{ stats: sb, kind: 'compare' }} size={240} color="emerald" showLabels />

        <ul className="space-y-1.5 text-sm">
          {categories.map((c) => {
            const va = sa[c.name];
            const vb = sb[c.name];
            return (
              <li key={c.name} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
                <span className={`text-right tabular-nums font-semibold ${va > vb ? 'text-emerald-300' : 'text-slate-300'}`}>{va}</span>
                <span className="text-center text-slate-400 truncate">{c.name}</span>
                <span className={`tabular-nums font-semibold ${vb > va ? 'text-sky-300' : 'text-slate-300'}`}>{vb}</span>
              </li>
            );
          })}
          <li className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 pt-2 border-t border-slate-800">
            <span className="text-right tabular-nums font-bold text-white">{a?.overall_rating ?? '-'}</span>
            <span className="text-center text-slate-400">OVR</span>
            <span className="tabular-nums font-bold text-white">{b?.overall_rating ?? '-'}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
