'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

interface HistoryCalendarProps {
  /** Dates (YYYY-MM-DD) with an archived match */
  matchDates: string[];
  selected: string | null;
  onSelect: (date: string | null) => void;
  /** Last year that can be browsed (see getVisibleHistoryYear): later months are not reachable */
  maxYear: number;
}

/** Month calendar of the history: days with a match are highlighted, tap one to see that match. */
export function HistoryCalendar({ matchDates, selected, onSelect, maxYear }: HistoryCalendarProps) {
  const dates = useMemo(() => new Set(matchDates), [matchDates]);
  const latest = useMemo(() => [...matchDates].sort().pop(), [matchDates]);
  const start = selected || latest || ymd(new Date().getFullYear(), new Date().getMonth(), 1);
  const [view, setView] = useState(() => {
    const y = Number(start.slice(0, 4));
    return y > maxYear ? { y: maxYear, m: 11 } : { y, m: Number(start.slice(5, 7)) - 1 };
  });
  const atLastMonth = view.y > maxYear || (view.y === maxYear && view.m === 11);

  const move = (delta: number) =>
    setView(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const offset = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday first
  const monthCount = matchDates.filter((d) => d.startsWith(ymd(view.y, view.m, 1).slice(0, 7))).length;

  return (
    <div className="bg-slate-900 rounded-2xl p-3 sm:p-4 space-y-3 w-full max-w-md mx-auto lg:mx-0">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Mese precedente"
          className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-white">
            {MONTHS[view.m]} {view.y}
          </div>
          <div className="text-[11px] text-slate-400">
            {monthCount === 0 ? 'Nessuna partita' : monthCount === 1 ? '1 partita' : `${monthCount} partite`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={atLastMonth}
          aria-label="Mese successivo"
          className="h-10 w-10 flex items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] font-bold uppercase text-slate-500 py-1">
            {w}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = ymd(view.y, view.m, i + 1);
          const hasMatch = dates.has(date);
          const isSel = selected === date;
          return (
            <button
              key={date}
              type="button"
              disabled={!hasMatch}
              onClick={() => onSelect(isSel ? null : date)}
              aria-pressed={isSel}
              aria-label={hasMatch ? `Partita del ${i + 1} ${MONTHS[view.m]}` : `${i + 1} ${MONTHS[view.m]}, nessuna partita`}
              className={`h-10 rounded-xl text-sm font-bold transition-all ${
                isSel
                  ? 'bg-emerald-500 text-slate-950'
                  : hasMatch
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/25'
                  : 'text-slate-600'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {selected && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-slate-300 border border-slate-700 hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" /> Mostra tutte le partite
        </button>
      )}
    </div>
  );
}
