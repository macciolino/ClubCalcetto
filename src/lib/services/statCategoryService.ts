'use client';

import { StatCategory, Profile, STAT_DETAILS } from '@/types/database';
import { getStoredPlayers, saveStoredPlayers } from './playerService';
import { saveStatCategoryDoc, deleteStatCategoryDoc } from '@/lib/firebase/firestoreService';

export const DEFAULT_BASE_CATEGORIES: StatCategory[] = [
  { id: '1', name: 'Velocità', label: 'Velocità / Scatto breve', default_value: 7 },
  { id: '2', name: 'Fisico', label: 'Fisico / Protezione palla e contrasti', default_value: 7 },
  { id: '3', name: 'Resistenza', label: 'Resistenza / Fiato', default_value: 7 },
  { id: '4', name: 'Tiro', label: 'Tiro / Conclusione', default_value: 7 },
  { id: '5', name: 'Passaggio', label: 'Passaggio / Sponde', default_value: 7 },
  { id: '6', name: 'Dribbling', label: 'Dribbling / Controllo nello stretto', default_value: 7 },
  { id: '7', name: 'Difesa', label: 'Difesa / 1v1', default_value: 7 },
  { id: '8', name: 'Visione', label: 'Visione di gioco / Tattica', default_value: 7 },
];

const CATEGORIES_STORAGE_KEY = 'clubcalcetto_stat_categories';

export { normalizeCategories, getStatValue } from '@/lib/utils/statUtils';

export function getStoredCategories(): StatCategory[] {
  if (typeof window === 'undefined') return DEFAULT_BASE_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed: StatCategory[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Errore lettura categorie da localStorage:', err);
  }
  saveStoredCategories(DEFAULT_BASE_CATEGORIES);
  return DEFAULT_BASE_CATEGORIES;
}

export function saveStoredCategories(categories: StatCategory[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    window.dispatchEvent(new Event('clubcalcetto_categories_changed'));
  } catch (err) {
    console.warn('Errore salvataggio categorie in localStorage:', err);
  }
}

export function resetToDefault8Categories(): StatCategory[] {
  saveStoredCategories(DEFAULT_BASE_CATEGORIES);
  return DEFAULT_BASE_CATEGORIES;
}
