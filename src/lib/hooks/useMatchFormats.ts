'use client';

import { useEffect, useState } from 'react';
import { subscribeMatchFormats } from '@/lib/firebase/firestoreService';
import { DayFormats, FORMAT_INFO, FormatInfo, MatchFormat, dayFormat } from '@/lib/utils/matchFormat';

/** Formats of every match day, in real time (admins choose them in Squadre / Impostazioni → Partita). */
export function useMatchFormats(): DayFormats {
  const [days, setDays] = useState<DayFormats>({});
  useEffect(() => {
    const unsub = subscribeMatchFormats(setDays);
    return () => unsub();
  }, []);
  return days;
}

/** Format of one day: format, formation and its numbers (players, per team, label). */
export function useDayFormat(date: string): { format: MatchFormat; formation: string } & FormatInfo {
  const days = useMatchFormats();
  const f = dayFormat(days, date);
  return { ...f, ...FORMAT_INFO[f.format] };
}
