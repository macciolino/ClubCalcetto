import { describe, expect, it } from 'vitest';
import { formatLongDate, localizeDay, type CalendarDay } from '@/lib/utils/dateUtils';

const day: CalendarDay = {
  dateString: '2026-11-18',
  dayName: 'Mercoledì',
  dayNumber: 18,
  monthName: 'Nov',
  isToday: false,
  isPast: false,
  dateObj: new Date(2026, 10, 18),
};

describe('Date nella lingua dell’app', () => {
  it('italiano: giorno del calendario invariato', () => {
    expect(localizeDay(day, 'it')).toBe(day);
  });

  it('inglese: nomi di giorno e mese tradotti, il resto invariato', () => {
    expect(localizeDay(day, 'en')).toMatchObject({ dayName: 'Wednesday', monthName: 'Nov', dayNumber: 18, dateString: '2026-11-18' });
  });

  it('data lunga in inglese', () => {
    expect(formatLongDate('2026-11-18', 'en')).toBe('Wednesday, 18 November 2026');
  });
});
