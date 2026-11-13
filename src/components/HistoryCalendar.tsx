'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocaleSetting } from '@/i18n/I18nProvider';

/** Month name in the app language, capitalised ("Novembre" / "November"). */
const monthName = (m: number, locale: string) => {
  const n = new Date(2000, m, 1).toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', { month: 'long' });
  return n.charAt(0).toUpperCase() + n.slice(1);
};

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
  const t = useTranslations('calendar');
  const { locale } = useLocaleSetting();
  const WEEKDAYS = t('weekdays').split(',');
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
  const month = monthName(view.m, locale);
  const monthCount = matchDates.filter((d) => d.startsWith(ymd(view.y, view.m, 1).slice(0, 7))).length;

  return (
    <div className="bg-card rounded-2xl p-3 sm:p-4 space-y-3 w-full max-w-md mx-auto lg:mx-0">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label={t('prevMonth')}
          className="h-10 w-10 flex items-center justify-center rounded-xl text-secondary hover:bg-card-hover"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-sm font-bold text-primary">
            {month} {view.y}
          </div>
          <div className="text-[11px] text-secondary">
            {t('monthCount', { count: monthCount })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={atLastMonth}
          aria-label={t('nextMonth')}
          className="h-10 w-10 flex items-center justify-center rounded-xl text-secondary hover:bg-card-hover disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={`${month} ${view.y}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] font-bold uppercase text-muted py-1">
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
              aria-label={hasMatch ? t('dayMatch', { day: i + 1, month }) : t('dayNoMatch', { day: i + 1, month })}
              className={`h-10 rounded-xl text-sm font-bold transition-all ${
                isSel
                  ? 'bg-accent text-on-accent'
                  : hasMatch
                  ? 'bg-accent/15 text-accent-text border border-accent/50 hover:bg-accent/25'
                  : 'text-muted'
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
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-secondary border border-line-strong hover:bg-card-hover"
        >
          <X className="h-3.5 w-3.5" /> {t('showAll')}
        </button>
      )}
    </div>
  );
}
