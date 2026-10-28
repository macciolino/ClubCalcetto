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
