'use client';

import { Presence } from '@/types/database';
import { getUpcomingDays } from '@/lib/utils/dateUtils';
import { DEFAULT_PLAYERS } from './playerService';

const PRESENCES_STORAGE_KEY = 'clubcalcetto_presences_list';

const TODAY_DATE = getUpcomingDays(7)[0]?.dateString || '2026-10-28';

export const DEFAULT_PRESENCES: Presence[] = DEFAULT_PLAYERS.map((p, idx) => ({
  id: `pres-${p.id}`,
  date: TODAY_DATE,
  player_id: p.id,
  status: (idx < 10 ? 'confirmed' : 'waitlist') as 'confirmed' | 'waitlist',
  order_index: idx + 1,
  created_at: new Date().toISOString(),
}));

export function getStoredPresences(date?: string): Presence[] {
  if (typeof window === 'undefined') {
    return date ? DEFAULT_PRESENCES.filter((p) => p.date === date) : DEFAULT_PRESENCES;
  }
  try {
    const raw = localStorage.getItem(PRESENCES_STORAGE_KEY);
    if (raw) {
      const parsed: Presence[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return date ? parsed.filter((p) => p.date === date) : parsed;
      }
    }
  } catch (err) {
    console.warn('Errore lettura presenze da localStorage:', err);
  }

  // Se non presente, inizializza con i 10 di default per la prima giornata
  saveStoredPresences(DEFAULT_PRESENCES);
  return date ? DEFAULT_PRESENCES.filter((p) => p.date === date) : DEFAULT_PRESENCES;
}

export function saveStoredPresences(presences: Presence[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PRESENCES_STORAGE_KEY, JSON.stringify(presences));
    window.dispatchEvent(new Event('clubcalcetto_presences_changed'));
  } catch (err) {
    console.warn('Errore salvataggio presenze in localStorage:', err);
  }
}

export function resetStoredPresences(): Presence[] {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(PRESENCES_STORAGE_KEY);
      window.dispatchEvent(new Event('clubcalcetto_presences_changed'));
    } catch {}
  }
  return [];
}

const MATCH_DATE_STORAGE_KEY = 'clubcalcetto_official_match_date';

export function getOfficialMatchDate(): string {
  if (typeof window === 'undefined') {
    return TODAY_DATE;
  }
  try {
    const saved = localStorage.getItem(MATCH_DATE_STORAGE_KEY);
    if (saved) return saved;
  } catch {}
  setOfficialMatchDate(TODAY_DATE);
  return TODAY_DATE;
}

export function setOfficialMatchDate(date: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MATCH_DATE_STORAGE_KEY, date);
    window.dispatchEvent(
      new CustomEvent('clubcalcetto_match_date_changed', { detail: { date } })
    );
  } catch (err) {
    console.warn('Errore salvataggio giorno ufficiale partita:', err);
  }
}
