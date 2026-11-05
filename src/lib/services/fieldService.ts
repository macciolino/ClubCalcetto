'use client';

import { SportField } from '@/types/database';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';

export const DEFAULT_SPORT_FIELDS: SportField[] = [
  {
    id: 'field-1',
    name: 'Centro Sportivo Green Club',
    address: 'Via dello Sport 12, Milano',
    maps_url: 'https://maps.google.com/?q=Via+dello+Sport+12+Milano',
    phone: '+39 02 8765432',
    court_type: 'Erba Sintetica 4G Outdoor',
    notes: 'Campo 3 con illuminazione LED pro, spogliatoi con riscaldamento a pavimento e ampio parcheggio.',
    created_at: '2026-01-01T10:00:00Z',
  },
  {
    id: 'field-2',
    name: 'PalaCalcetto San Siro Arena',
    address: 'Via Novara 45, Milano',
    maps_url: 'https://maps.google.com/?q=Via+Novara+45+Milano',
    phone: '+39 02 4891234',
    court_type: 'Indoor Parquet Professionale',
    notes: 'Campo 1 coperto e climatizzato, fondo in parquet ammortizzato anti-trauma, docce singole.',
    created_at: '2026-01-02T10:00:00Z',
  },
  {
    id: 'field-3',
    name: 'Sporting Village Bovisa',
    address: 'Via Durando 28, Milano',
    maps_url: 'https://maps.google.com/?q=Via+Durando+28+Milano',
    phone: '+39 02 2399111',
    court_type: 'Sintetico 5G con Intaso Naturale',
    notes: 'Campo 5 con rimbalzo controllato e bar panoramico per il terzo tempo.',
    created_at: '2026-01-03T10:00:00Z',
  },
];

const FIELDS_STORAGE_KEY = 'clubcalcetto_sport_fields';

export function getStoredFields(): SportField[] {
  if (typeof window === 'undefined') return DEFAULT_SPORT_FIELDS;
  try {
    const raw = localStorage.getItem(FIELDS_STORAGE_KEY);
    if (raw) {
      const parsed: SportField[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Errore lettura campi da calcetto:', err);
  }
  saveStoredFields(DEFAULT_SPORT_FIELDS);
  return DEFAULT_SPORT_FIELDS;
}

export function saveStoredFields(fields: SportField[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields));
    window.dispatchEvent(new Event('clubcalcetto_fields_changed'));
  } catch (err) {
    console.warn('Errore salvataggio campi da calcetto:', err);
  }
}

export async function addStoredField(field: Omit<SportField, 'id'>): Promise<SportField> {
  const newField: SportField = {
    ...field,
    id: `field-${Date.now()}`,
    created_at: new Date().toISOString(),
  };

  const current = getStoredFields();
  const updated = [...current, newField];
  saveStoredFields(updated);

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'sport_fields', newField.id), newField, { merge: true });
    } catch (e) {
      console.warn('[Firestore] Error saving field:', e);
    }
  }

  return newField;
}

export async function updateStoredField(field: SportField): Promise<SportField> {
  const current = getStoredFields();
  const updated = current.map((f) => (f.id === field.id ? field : f));
  saveStoredFields(updated);

  if (isFirebaseConfigured) {
    try {
      await setDoc(doc(db, 'sport_fields', field.id), field, { merge: true });
    } catch (e) {
      console.warn('[Firestore] Error updating field:', e);
    }
  }

  return field;
}

export async function removeStoredField(id: string): Promise<void> {
  const current = getStoredFields();
  const updated = current.filter((f) => f.id !== id);
  saveStoredFields(updated);

  if (isFirebaseConfigured) {
    try {
      await deleteDoc(doc(db, 'sport_fields', id));
    } catch (e) {
      console.warn('[Firestore] Error deleting field:', e);
    }
  }
}

export function subscribeSportFields(
  callback: (fields: SportField[]) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const colRef = collection(db, 'sport_fields');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: SportField[] = [];
          snapshot.forEach((d) => list.push(d.data() as SportField));
          callback(list);
          saveStoredFields(list);
        }
        // NOTE: no automatic seeding of demo fields into the real database
      },
      (err) => {
        console.warn('[Firestore] subscribeSportFields error:', err);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeSportFields exception:', err);
    return () => {};
  }
}
