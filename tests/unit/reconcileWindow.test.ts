/** C11: the substitutions check (/api/notify 'reconcile') runs only for days that can still change. */
import { describe, expect, it } from 'vitest';
import { isReconcileDate } from '@/lib/utils/reconcileWindow';

const now = new Date('2026-11-18T10:00:00Z'); // 11:00 in Rome

describe('isReconcileDate (C11)', () => {
  it('ieri, oggi e i prossimi 30 giorni: sì', () => {
    expect(isReconcileDate('2026-11-17', now)).toBe(true);
    expect(isReconcileDate('2026-11-18', now)).toBe(true);
    expect(isReconcileDate('2026-12-18', now)).toBe(true);
  });
  it('date vecchie o troppo lontane: no', () => {
    expect(isReconcileDate('2026-11-16', now)).toBe(false);
    expect(isReconcileDate('2026-12-19', now)).toBe(false);
    expect(isReconcileDate('1999-01-01', now)).toBe(false);
    expect(isReconcileDate('2099-01-01', now)).toBe(false);
  });
  it('a mezzanotte conta il giorno italiano', () => {
    // 23:30 UTC on the 18th = 00:30 of the 19th in Rome → "yesterday" is the 18th
    expect(isReconcileDate('2026-11-17', new Date('2026-11-18T23:30:00Z'))).toBe(false);
    expect(isReconcileDate('2026-11-18', new Date('2026-11-18T23:30:00Z'))).toBe(true);
  });
});
