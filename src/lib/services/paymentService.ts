'use client';

import { MatchPaymentRecord } from '@/types/database';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { doc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';

const PAYMENTS_KEY_PREFIX = 'clubcalcetto_payments_';

export function getMatchPayments(
  date: string,
  starterIds: string[] = [],
  totalCost: number = 80
): MatchPaymentRecord {
  const costPerPlayer = Number((totalCost / 10).toFixed(2));
  const fallbackRecord: MatchPaymentRecord = {
    date,
    total_cost: totalCost,
    cost_per_player: costPerPlayer,
    payments: {},
    updated_at: new Date().toISOString(),
  };

  if (typeof window === 'undefined') return fallbackRecord;

  try {
    const raw = localStorage.getItem(`${PAYMENTS_KEY_PREFIX}${date}`);
    if (raw) {
      const parsed: MatchPaymentRecord = JSON.parse(raw);
      return {
        ...parsed,
        total_cost: totalCost,
        cost_per_player: costPerPlayer,
      };
    }
  } catch (err) {
    console.warn('Errore lettura pagamenti cassa:', err);
  }

  // Pre-popola per i titolari esistenti (di default tutti da saldare)
  const initialPayments: Record<string, boolean> = {};
  starterIds.forEach((id) => {
    initialPayments[id] = false;
  });
  fallbackRecord.payments = initialPayments;

  saveMatchPayments(fallbackRecord);
  return fallbackRecord;
}

export function saveMatchPayments(record: MatchPaymentRecord) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${PAYMENTS_KEY_PREFIX}${record.date}`, JSON.stringify(record));
    window.dispatchEvent(
      new CustomEvent('clubcalcetto_payments_changed', { detail: record })
    );

    if (isFirebaseConfigured) {
      setDoc(doc(db, 'match_payments', record.date), record, { merge: true }).catch((err) => {
        console.warn('[Firestore] Error saving payments:', err);
      });
    }
  } catch (err) {
    console.warn('Errore salvataggio pagamenti cassa:', err);
  }
}

export function togglePlayerPayment(
  date: string,
  playerId: string,
  starterIds: string[] = [],
  totalCost: number = 80
): MatchPaymentRecord {
  const current = getMatchPayments(date, starterIds, totalCost);
  const currentStatus = Boolean(current.payments[playerId]);
  const updatedPayments = {
    ...current.payments,
    [playerId]: !currentStatus,
  };

  const updatedRecord: MatchPaymentRecord = {
    ...current,
    total_cost: totalCost,
    cost_per_player: Number((totalCost / 10).toFixed(2)),
    payments: updatedPayments,
    updated_at: new Date().toISOString(),
  };

  saveMatchPayments(updatedRecord);
  return updatedRecord;
}

export function setAllPayments(
  date: string,
  starterIds: string[],
  paid: boolean,
  totalCost: number = 80
): MatchPaymentRecord {
  const current = getMatchPayments(date, starterIds, totalCost);
  const newPayments: Record<string, boolean> = {};
  starterIds.forEach((id) => {
    newPayments[id] = paid;
  });

  const updatedRecord: MatchPaymentRecord = {
    ...current,
    total_cost: totalCost,
    cost_per_player: Number((totalCost / 10).toFixed(2)),
    payments: newPayments,
    updated_at: new Date().toISOString(),
  };

  saveMatchPayments(updatedRecord);
  return updatedRecord;
}

export function resetMatchPayments(
  date: string,
  starterIds: string[] = [],
  totalCost: number = 80
): MatchPaymentRecord {
  return setAllPayments(date, starterIds, false, totalCost);
}

export function subscribeMatchPayments(
  date: string,
  callback: (record: MatchPaymentRecord | null) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }

  try {
    const docRef = doc(db, 'match_payments', date);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as MatchPaymentRecord;
          callback(data);
          // Aggiorna cache locale
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`${PAYMENTS_KEY_PREFIX}${date}`, JSON.stringify(data));
            } catch {
              /* memoria del browser piena o bloccata (es. navigazione privata): basta Firestore */
            }
          }
        } else {
          callback(null);
        }
      },
      (err) => {
        console.warn('[Firestore] subscribeMatchPayments warning:', err);
      }
    );
  } catch (err) {
    console.warn('[Firestore] subscribeMatchPayments exception:', err);
    return () => {};
  }
}
