'use client';

import { StatCategory } from '@/types/database';

import { DEFAULT_BASE_CATEGORIES } from '@/lib/utils/defaultCategories';
export { DEFAULT_BASE_CATEGORIES };

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
