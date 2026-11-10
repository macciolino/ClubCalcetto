export interface CalendarDay {
  dateString: string; // YYYY-MM-DD
  dayName: string; // es. Lunedì
  dayNumber: number; // es. 14
  monthName: string; // es. Nov
  isToday: boolean;
  isPast: boolean;
  dateObj: Date;
}

const ITALIAN_DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const ITALIAN_MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/**
 * Restituisce i giorni della settimana successiva (o corrente + 7 giorni)
 */
export function getUpcomingDays(count = 7): CalendarDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: CalendarDay[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    days.push({
      dateString,
      dayName: ITALIAN_DAYS[d.getDay()],
      dayNumber: d.getDate(),
      monthName: ITALIAN_MONTHS[d.getMonth()],
      isToday: i === 0,
      isPast: false,
      dateObj: d,
    });
  }

  return days;
}

/** Local date -> 'YYYY-MM-DD' */
export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sunday (YYYY-MM-DD) of the week (Mon-Sun) containing `from` */
export function getWeekEndDateString(from: Date = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const daysToSunday = (7 - d.getDay()) % 7; // getDay(): 0 = Sunday
  d.setDate(d.getDate() + daysToSunday);
  return toDateString(d);
}

/** Sunday (YYYY-MM-DD) of NEXT week */
export function getNextWeekEndDateString(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 7);
  return getWeekEndDateString(d);
}

/**
 * Calendar shown to everyone: from today to the end of NEXT week (Sunday).
 * Days of next week are locked for players until an admin opens voting.
 */
export function getCalendarDays(from: Date = new Date()): CalendarDay[] {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  const lastDay = getNextWeekEndDateString(today);
  const days: CalendarDay[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateString = toDateString(d);
    if (dateString > lastDay) break;
    days.push({
      dateString,
      dayName: ITALIAN_DAYS[d.getDay()],
      dayNumber: d.getDate(),
      monthName: ITALIAN_MONTHS[d.getMonth()],
      isToday: i === 0,
      isPast: false,
      dateObj: d,
    });
  }
  return days;
}

/**
 * Players may sign up for a day if it is in the current week, or if an admin opened voting up to `openUntil`.
 * (Same rule is enforced server-side in firestore.rules.)
 */
export function isDateOpenForPlayers(dateString: string, openUntil?: string | null, now: Date = new Date()): boolean {
  if (dateString <= getWeekEndDateString(now)) return true;
  return Boolean(openUntil && dateString <= openUntil);
}

/**
 * Formatta una data YYYY-MM-DD in formato leggibile italiano (es: "Lunedì 15 Novembre 2026")
 */
export function formatItalianDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const fullMonths = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];
  return `${ITALIAN_DAYS[d.getDay()]} ${day} ${fullMonths[d.getMonth()]} ${year}`;
}

/**
 * Latest year shown in the Storico (season menu and calendar).
 * The new year becomes visible on 31 December at 22:00 Italian time (Europe/Rome), whatever the device time zone;
 * before that moment it must not appear anywhere. Valid for every year, nothing is hard-coded.
 */
export function getVisibleHistoryYear(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get('year');
  return get('month') === 12 && get('day') === 31 && get('hour') % 24 >= 22 ? year + 1 : year;
}
