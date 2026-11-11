'use client';

import React, { useEffect, useRef, useState } from 'react';
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

  // Trascina la barra in alto verso il basso per chiudere
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (startY.current = e.touches[0].clientY);
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - startY.current));
  };
  const onTouchEnd = () => {
    if (dragY > 100) onClose();
    else setDragY(0);
    startY.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center animate-fade" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        className="w-full sm:max-w-xl h-[80vh] flex flex-col bg-slate-900 border border-slate-800 border-b-0 rounded-t-3xl shadow-2xl animate-sheet pb-safe"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra per trascinare + titolo */}
        <div className="flex-shrink-0 px-5 pt-2" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-700" aria-hidden="true" />
          <div className="flex items-center justify-between pb-3">
            <h2 id="compare-title" className="text-lg font-semibold text-white">
              Confronta giocatori
            </h2>
            <button type="button" onClick={onClose} aria-label="Chiudi" className="p-2 -m-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {select(aId, setAId, 'border-emerald-500')}
          {select(bId, setBId, 'border-sky-500')}
        </div>

        <div className="flex flex-col items-center">
          <RadarChart stats={sa} overlay={{ stats: sb, kind: 'compare' }} size={260} color="emerald" showLabels showValues={false} />
          <div className="flex items-center gap-4 text-xs text-slate-300">
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
    </div>
  );
}
