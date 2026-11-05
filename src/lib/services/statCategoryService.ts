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

export function getStoredCategories(): StatCategory[] {
  if (typeof window === 'undefined') return DEFAULT_BASE_CATEGORIES;
  try {
    const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed: StatCategory[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
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

export async function addStoredCategory(newCat: {
  name: string;
  label?: string;
  default_value: number;
}): Promise<StatCategory[]> {
  const currentCats = getStoredCategories();
  const catObj: StatCategory = {
    id: `cat-${Date.now()}`,
    name: newCat.name.trim(),
    label: newCat.label?.trim() || newCat.name.trim(),
    default_value: newCat.default_value ?? 7,
  };

  const updatedCats = [...currentCats, catObj];
  saveStoredCategories(updatedCats);

  // AGGIORNA IN REAL-TIME TUTTI I GIOCATORI ISCRITTI
  // Inserisce la nuova statistica con il valore di default e ricalcola l'overall rating per ciascuno
  const currentPlayers = getStoredPlayers();
  const updatedPlayers: Profile[] = currentPlayers.map((p) => {
    const existingStats = p.stats || {};
    const newStats = {
      ...existingStats,
      [catObj.name]: existingStats[catObj.name] ?? catObj.default_value,
    };
    const values = Object.values(newStats).filter((v) => typeof v === 'number');
    const avg =
      values.length > 0
        ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
        : p.overall_rating;

    return {
      ...p,
      stats: newStats,
      overall_rating: avg,
      updated_at: new Date().toISOString(),
    };
  });

  saveStoredPlayers(updatedPlayers);
  saveStatCategoryDoc(catObj);

  return updatedCats;
}

export async function removeStoredCategory(
  categoryId: string,
  categoryName: string
): Promise<StatCategory[]> {
  const currentCats = getStoredCategories();
  const updatedCats = currentCats.filter(
    (c) => c.id !== categoryId && c.name.toLowerCase() !== categoryName.toLowerCase()
  );
  saveStoredCategories(updatedCats);

  // Rimuove la statistica dai profili
  const currentPlayers = getStoredPlayers();
  const updatedPlayers: Profile[] = currentPlayers.map((p) => {
    const existingStats = { ...(p.stats || {}) };
    delete existingStats[categoryName];
    const values = Object.values(existingStats).filter((v) => typeof v === 'number');
    const avg =
      values.length > 0
        ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
        : p.overall_rating;

    return {
      ...p,
      stats: existingStats,
      overall_rating: avg,
      updated_at: new Date().toISOString(),
    };
  });

  saveStoredPlayers(updatedPlayers);
  await deleteStatCategoryDoc(categoryId);

  return updatedCats;
}
