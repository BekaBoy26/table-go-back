/** Bookable start times, every 30 minutes. */
export const SLOT_TIMES = [
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
  '22:30',
];

export const MAX_GUESTS = 12;

/** How many days ahead (including today) a table can be booked. */
export const BOOKING_WINDOW_DAYS = 14;

/** All restaurants are in Bishkek; "today" and "past" are judged by its clock. */
const TIME_ZONE = 'Asia/Bishkek';

// The same values as SQL expressions, for queries that need them inline.
export const SQL_SLOT_TIMES = `ARRAY[${SLOT_TIMES.map((t) => `'${t}'`).join(', ')}]`;
export const SQL_TODAY = `(NOW() AT TIME ZONE '${TIME_ZONE}')::date`;
export const SQL_NOW_TIME = `to_char(NOW() AT TIME ZONE '${TIME_ZONE}', 'HH24:MI')`;

/** Current date ('YYYY-MM-DD') and time ('HH:mm') in the restaurants' city. */
export function nowInCity(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The slot has already started (strings compare correctly in these formats). */
export function isPastSlot(date: string, time: string, now = nowInCity()) {
  return date < now.date || (date === now.date && time <= now.time);
}

export function isInBookingWindow(date: string, now = nowInCity()) {
  return date >= now.date && date < addDays(now.date, BOOKING_WINDOW_DAYS);
}
