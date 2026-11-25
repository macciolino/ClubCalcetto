'use client';

import { SportField } from '@/types/database';
import { reportWriteError } from '@/lib/utils/writeErrors';
import { auth, isFirebaseConfigured } from '@/lib/firebase/config';
import {
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { canCacheLeagueData, lcol, ldoc } from '@/lib/league/leagueRefs';

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

/**
 * The copy of the league's fields kept on this device. With Firebase it is only a mirror of the league's own fields: a
 * league with none has an empty copy (never the demo fields, which belong to local development without Firebase).
 */
export function getStoredFields(): SportField[] {
  if (typeof window === 'undefined') return isFirebaseConfigured ? [] : DEFAULT_SPORT_FIELDS;
  try {
    const raw = localStorage.getItem(FIELDS_STORAGE_KEY);
    if (raw) {
      const parsed: SportField[] = JSON.parse(raw);
      if (Array.isArray(parsed) && (parsed.length > 0 || isFirebaseConfigured)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Errore lettura campi da calcetto:', err);
  }
  if (isFirebaseConfigured) return [];
  saveStoredFields(DEFAULT_SPORT_FIELDS);
  return DEFAULT_SPORT_FIELDS;
}

export function saveStoredFields(fields: SportField[]) {
  if (typeof window === 'undefined' || !canCacheLeagueData()) return;
  try {
    localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields));
    window.dispatchEvent(new Event('clubcalcetto_fields_changed'));
  } catch (err) {
    console.warn('Errore salvataggio campi da calcetto:', err);
  }
}

/** Firestore refuses `undefined`: empty values are left out; on update an emptied value is removed from the document. */
function toFirestore(field: SportField, removeEmpty: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.keys(field) as (keyof SportField)[]).forEach((k) => {
    if (field[k] !== undefined) out[k] = field[k];
  });
  if (removeEmpty) {
    (['maps_url', 'phone', 'court_type', 'notes', 'cost'] as const).forEach((k) => {
      if (field[k] === undefined) out[k] = deleteField();
    });
    // Costi per formato: con merge le chiavi svuotate vanno tolte una per una (casella vuota = formato non disponibile)
    const costs: Record<string, unknown> = {};
    (['7v7', '8v8', '11v11'] as const).forEach((f) => {
      const v = field.costs?.[f];
      costs[f] = Number(v) > 0 ? Number(v) : deleteField();
    });
    out.costs = costs;
  } else if (field.costs) {
    const costs: Record<string, number> = {};
    Object.entries(field.costs).forEach(([f, v]) => Number(v) > 0 && (costs[f] = Number(v)));
    if (Object.keys(costs).length) out.costs = costs;
    else delete out.costs;
  }
  return out;
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
      await setDoc(ldoc('sport_fields', newField.id), toFirestore(newField, false), { merge: true });
    } catch (e) {
      console.warn('[Firestore] Error saving field:', e);
      reportWriteError(e);
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
      // Linked to the global catalog: the league changes only its prices and notes (firestore.rules)
      const data = toFirestore(field, true);
      const payload = field.catalog_id
        ? { cost: data.cost, costs: data.costs, notes: data.notes ?? deleteField(), price_override: field.price_override === true, updated_at: new Date().toISOString() }
        : data;
      await setDoc(ldoc('sport_fields', field.id), payload, { merge: true });
    } catch (e) {
      console.warn('[Firestore] Error updating field:', e);
      reportWriteError(e);
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
      await deleteDoc(ldoc('sport_fields', id));
    } catch (e) {
      console.warn('[Firestore] Error deleting field:', e);
      reportWriteError(e);
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
    const colRef = lcol('sport_fields');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: SportField[] = [];
          snapshot.forEach((d) => list.push(d.data() as SportField));
          callback(list);
          saveStoredFields(list);
        } else {
          // A league with no fields of its own: say so, so no page keeps showing the copy kept on this device
          // (it can belong to another league) and prices come only from this league's data; the copy is emptied too
          callback([]);
          saveStoredFields([]);
        }
        // NOTE: no automatic seeding of demo fields into the real database
      },
      (err) => {
        // A listener that outlives the sign-out is denied for a moment: expected, not worth a warning
        if (err?.code === 'permission-denied' && !auth.currentUser) return;
        console.warn('[Firestore] subscribeSportFields error:', err);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeSportFields exception:', err);
    return () => {};
  }
}
