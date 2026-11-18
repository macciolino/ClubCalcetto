/**
 * C14: firestore.rules computes Italian time with this formula (lastSundayAt1Utc / isItalianSummerTime).
 * Rules cannot run with a fake clock, so the SAME formula is checked here against the real Europe/Rome zone.
 * If you change the formula in the rules, change it here too.
 */
import { describe, expect, it } from 'vitest';

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** rules: timestamp.date(year, month, 31) − (dayOfWeek % 7) days + 1h; dayOfWeek Monday = 1 … Sunday = 7 */
function lastSundayAt1Utc(year: number, month: number): number {
  const last = Date.UTC(year, month - 1, 31);
  const dayOfWeek = new Date(last).getUTCDay() || 7;
  return last - (dayOfWeek % 7) * DAY + HOUR;
}
const isItalianSummerTime = (t: number) => {
  const y = new Date(t).getUTCFullYear();
  return t >= lastSundayAt1Utc(y, 3) && t < lastSundayAt1Utc(y, 10);
};
const ruleOffsetHours = (t: number) => (isItalianSummerTime(t) ? 2 : 1);

function realOffsetHours(t: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23', day: '2-digit' }).formatToParts(new Date(t));
  const h = Number(parts.find((p) => p.type === 'hour')!.value);
  const d = Number(parts.find((p) => p.type === 'day')!.value);
  const utc = new Date(t);
  const dayShift = d === utc.getUTCDate() ? 0 : 24;
  return (h + dayShift - utc.getUTCHours()) % 24;
}

describe('ora italiana nelle regole (C14)', () => {
  it('coincide con il fuso Europe/Rome ogni ora, 2024–2032', () => {
    const wrong: string[] = [];
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2033, 0, 1); t += HOUR) {
      if (ruleOffsetHours(t) !== realOffsetHours(t)) wrong.push(new Date(t).toISOString());
    }
    expect(wrong).toEqual([]);
  });

  it('cambi d’ora 2026: 29 marzo e 25 ottobre alle 01:00 UTC', () => {
    expect(new Date(lastSundayAt1Utc(2026, 3)).toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(new Date(lastSundayAt1Utc(2026, 10)).toISOString()).toBe('2026-10-25T01:00:00.000Z');
  });
});
