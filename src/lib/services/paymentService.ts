'use client';

import { MatchPaymentRecord } from '@/types/database';
import { db, isFirebaseConfigured } from '@/lib/firebase/config';
import { doc, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';

/**
 * Cassa of a match (collection match_payments, doc id = date): `payments[playerId] = true` when paid.
 *
 * Safety rules (the payments of past matches are real data):
 *  - READING never writes (a device opening the Cassa for the first time must not reset anything);
 *  - every change writes ONLY the players touched (merge on `payments.<id>`), never the whole list,
 *    so two admins on two phones, or an old copy on a phone, cannot overwrite each other;
 *  - nothing is ever removed: a player who leaves the teams keeps his paid / unpaid status in the document.
 */

const PAYMENTS_KEY_PREFIX = 'clubcalcetto_payments_';

const emptyRecord = (date: string): MatchPaymentRecord => ({
  date,
  total_cost: 0,
  cost_per_player: 0,
  payments: {},
  updated_at: '',
});

/** Last known record on this device (cache of Firestore), or an empty one. Never writes. */
export function getCachedMatchPayments(date: string): MatchPaymentRecord {
  if (typeof window === 'undefined') return emptyRecord(date);
  try {
    const raw = localStorage.getItem(`${PAYMENTS_KEY_PREFIX}${date}`);
    if (raw) {
      const parsed = JSON.parse(raw) as MatchPaymentRecord;
      return { ...emptyRecord(date), ...parsed, payments: parsed.payments || {} };
    }
  } catch {
    /* cache illeggibile: si aspetta Firestore */
  }
  return emptyRecord(date);
}

function cache(record: MatchPaymentRecord) {
  try {
    localStorage.setItem(`${PAYMENTS_KEY_PREFIX}${record.date}`, JSON.stringify(record));
  } catch {
    /* memoria del browser piena o bloccata (es. navigazione privata): basta Firestore */
  }
}

/**
 * Marks some players as paid / unpaid. Writes only their entries (plus cost info for the record).
 * Returns the record as it will be (shown at once, then confirmed by the realtime listener).
 */
export function setPlayersPaid(
  current: MatchPaymentRecord,
  playerIds: string[],
  paid: boolean,
  cost: { totalCost: number; players: number }
): MatchPaymentRecord {
  const changes: Record<string, boolean> = {};
  playerIds.forEach((id) => (changes[id] = paid));
  const now = new Date().toISOString();
  const costInfo = {
    total_cost: cost.totalCost,
    cost_per_player: Number((cost.totalCost / Math.max(1, cost.players)).toFixed(2)),
  };
  const next: MatchPaymentRecord = { ...current, ...costInfo, payments: { ...current.payments, ...changes }, updated_at: now };
  if (typeof window !== 'undefined') cache(next);
  if (isFirebaseConfigured && playerIds.length > 0) {
    // merge su una mappa annidata: cambiano SOLO le chiavi scritte, le altre restano come sono
    setDoc(doc(db, 'match_payments', current.date), { date: current.date, ...costInfo, payments: changes, updated_at: now }, { merge: true }).catch(
      (err) => console.warn('[Firestore] Error saving payments:', err)
    );
  }
  return next;
}

export function subscribeMatchPayments(
  date: string,
  callback: (record: MatchPaymentRecord | null) => void
): Unsubscribe | (() => void) {
  if (!isFirebaseConfigured || typeof window === 'undefined') {
    return () => {};
  }
  try {
    return onSnapshot(
      doc(db, 'match_payments', date),
      (snap) => {
        if (snap.exists()) {
          const data = { ...emptyRecord(date), ...(snap.data() as MatchPaymentRecord) };
          data.payments = data.payments || {};
          callback(data);
          cache(data);
        } else {
          callback(null);
        }
      },
      (err) => console.warn('[Firestore] subscribeMatchPayments warning:', err)
    );
  } catch (err) {
    console.warn('[Firestore] subscribeMatchPayments exception:', err);
    return () => {};
  }
}
