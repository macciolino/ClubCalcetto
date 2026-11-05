'use client';

import { Presence, Profile, AppSettings } from '@/types/database';
import { getUpcomingDays } from '@/lib/utils/dateUtils';
import { DEFAULT_PLAYERS, getStoredPlayers } from './playerService';

const PRESENCES_STORAGE_KEY = 'clubcalcetto_presences_list';
const SETTINGS_STORAGE_KEY = 'clubcalcetto_app_settings';
const MATCH_DATE_STORAGE_KEY = 'clubcalcetto_official_match_date';

const TODAY_DATE = getUpcomingDays(7)[0]?.dateString || '2026-10-28';

export const DEFAULT_PRESENCES: Presence[] = DEFAULT_PLAYERS.map((p, idx) => ({
  id: `pres-${p.id}`,
  date: TODAY_DATE,
  player_id: p.id,
  status: (idx < 10 ? 'confirmed' : 'waitlist') as 'confirmed' | 'waitlist',
  order_index: idx + 1,
  created_at: new Date().toISOString(),
}));

// ==========================================
// 1. GESTIONE PRESENZE
// ==========================================

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

/**
 * Rimuove un giocatore confermato o in attesa per una determinata data.
 * Se il giocatore rimosso era un titolare (order_index <= 10 o status === 'confirmed')
 * e c'è almeno un giocatore in lista d'attesa (wishlist), il primo in coda ordinato
 * rigorosamente per iscrizione (joinedAt / created_at ASC) viene promosso
 * AUTOMATICAMENTE a titolare confermato in modo silenzioso e trasparente.
 */
export function processPresenceRemovalWithAutoSubstitution(
  date: string,
  presenceIdToRemove: string,
  currentPresences?: Presence[]
): {
  updatedPresences: Presence[];
  promotedPresences: Presence[];
} {
  const basePresences = (currentPresences && currentPresences.length > 0)
    ? currentPresences
    : getStoredPresences();

  // Trova la presenza da rimuovere (cercando per id o per player_id)
  const target = basePresences.find(
    (p) => (p.id === presenceIdToRemove || p.player_id === presenceIdToRemove) && p.date === date
  ) || basePresences.find(
    (p) => p.id === presenceIdToRemove || p.player_id === presenceIdToRemove
  );

  if (!target) {
    console.warn('[AutoSub] Presenza da rimuovere non trovata:', presenceIdToRemove);
    return { updatedPresences: basePresences, promotedPresences: [] };
  }

  const targetDate = target.date || date;
  // Tutte le presenze escluso il giocatore rimosso
  const remainingAll = basePresences.filter((p) => p.id !== target.id);
  
  // Presenze rimaste per questa specifica giornata
  const dayPresences = remainingAll.filter((p) => p.date === targetDate);

  // Titolari confermati rimasti
  const confirmedList = dayPresences
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => (a.order_index ?? 999) - (b.order_index ?? 999));

  // Coda wishlist ordinata rigidamente per data di iscrizione (joinedAt ASC) e poi ordine
  const waitlistList = dayPresences
    .filter((p) => p.status === 'waitlist')
    .sort((a, b) => {
      const timeA = new Date(a.created_at || 0).getTime();
      const timeB = new Date(b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.order_index ?? 999) - (b.order_index ?? 999);
    });

  const wasStarter = target.status === 'confirmed' || (target.order_index && target.order_index <= 10);
  const promotedPresences: Presence[] = [];

  // Se è stato rimosso un titolare (o abbiamo meno di 10 titolari) e ci sono riserve in lista d'attesa:
  if (wasStarter && confirmedList.length < 10 && waitlistList.length > 0) {
    const spotsToFill = 10 - confirmedList.length;
    const candidates = waitlistList.splice(0, spotsToFill);

    for (const sub of candidates) {
      const promoted: Presence = {
        ...sub,
        status: 'confirmed',
      };
      confirmedList.push(promoted);
      promotedPresences.push(promoted);
    }
  }

  // Riassegna gli indici rigorosamente: 1..10 per i titolari confermati, 11..N per le riserve in waitlist
  const reindexedConfirmed: Presence[] = confirmedList.map((p, idx) => ({
    ...p,
    order_index: idx + 1,
    status: 'confirmed' as const,
  }));

  const reindexedWaitlist: Presence[] = waitlistList.map((p, idx) => ({
    ...p,
    order_index: reindexedConfirmed.length + idx + 1,
    status: 'waitlist' as const,
  }));

  const finalDayPresences = [...reindexedConfirmed, ...reindexedWaitlist];

  const finalPresences = [
    ...remainingAll.filter((p) => p.date !== targetDate),
    ...finalDayPresences,
  ];

  saveStoredPresences(finalPresences);
  return { updatedPresences: finalPresences, promotedPresences };
}
