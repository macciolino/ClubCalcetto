'use client';

import { Presence, AppSettings } from '@/types/database';
import { toDateString } from '@/lib/utils/dateUtils';

const MATCH_DATE_STORAGE_KEY = 'clubcalcetto_official_match_date';
const SETTINGS_STORAGE_KEY = 'clubcalcetto_app_settings';
const LEGACY_PRESENCES_STORAGE_KEY = 'clubcalcetto_presences_list';

const TODAY_DATE = toDateString(new Date());

import { MAX_STARTERS, rankDayPresences, rankPresencesByDate } from '@/lib/utils/presenceRanking';
export { MAX_STARTERS, rankDayPresences, rankPresencesByDate };

// Presences now live ONLY in Firestore (realtime). Drop the old local copy, which could contain demo data.
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(LEGACY_PRESENCES_STORAGE_KEY);
  } catch {}
}

// ==========================================
// 1. ORDINE PRESENZE (titolari / waitlist)
// ==========================================
//
// Status and position are COMPUTED from the sign-up order, never trusted from the stored fields:
//  - presences created before the redesign (no joined_at) keep their historical order_index and come first;
//  - newer ones are ordered by joined_at (Firestore server time, so nobody can jump the queue);
//  - an admin override can force a player into the starters or onto the waitlist.
// Withdrawing simply deletes one's own presence: the first in waitlist moves up automatically.

/**
 * Who would be promoted from the waitlist if `presenceId` were removed (used for notifications).
 */
export function getPromotedOnRemoval(dayPresences: Presence[], presenceId: string): Presence[] {
  const before = rankDayPresences(dayPresences);
  const after = rankDayPresences(dayPresences.filter((p) => p.id !== presenceId));
  const wasWaitlist = new Set(before.filter((p) => p.status === 'waitlist').map((p) => p.id));
  return after.filter((p) => p.status === 'confirmed' && wasWaitlist.has(p.id));
}

// ==========================================
// 2. GIORNO UFFICIALE PARTITA
// ==========================================

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

// ==========================================
// 3. IMPOSTAZIONI APP
// ==========================================

const DEFAULT_SETTINGS: AppSettings = {
  official_match_date: TODAY_DATE,
  timelock_enabled: false,
  timelock_hours_before: 4,
  standard_match_time: '20:30',
  standard_total_cost: 80,
};

export function getAppSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('Errore lettura app settings:', err);
  }
  return DEFAULT_SETTINGS;
}

export function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const updated = { ...current, ...settings };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent('clubcalcetto_settings_changed', { detail: updated })
      );
    } catch (err) {
      console.warn('Errore salvataggio app settings:', err);
    }
  }
  return updated;
}

export function isTimelockActive(
  matchDate: string,
  matchTime = '20:30'
): { locked: boolean; reason?: string } {
  const settings = getAppSettings();
  if (!settings.timelock_enabled) {
    return { locked: false };
  }

  const hoursBefore = settings.timelock_hours_before || 4;
  try {
    const matchDateTime = new Date(`${matchDate}T${matchTime}:00`);
    const lockThreshold = new Date(matchDateTime.getTime() - hoursBefore * 60 * 60 * 1000);
    const now = new Date();

    if (now >= lockThreshold) {
      return {
        locked: true,
        reason: `Disdette bloccate automaticamente a meno di ${hoursBefore}h dalla partita (${matchTime}). Contatta l'Amministratore per disdire.`,
      };
    }
  } catch (err) {
    console.warn('Errore calcolo timelock:', err);
  }

  return { locked: false };
}
