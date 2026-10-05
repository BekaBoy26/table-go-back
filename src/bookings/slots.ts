export const MAX_GUESTS = 12;

/** A booking lasts 1 hour by default; guests can extend it up to this many hours. */
export const MAX_HOURS = 4;

/** How many days ahead (including today) a table can be booked. */
export const BOOKING_WINDOW_DAYS = 14;

/** All restaurants are in Bishkek; "today" and "past" are judged by its clock. */
const TIME_ZONE = 'Asia/Bishkek';

export const SQL_TODAY = `(NOW() AT TIME ZONE '${TIME_ZONE}')::date`;
export const SQL_NOW_TIME = `to_char(NOW() AT TIME ZONE '${TIME_ZONE}', 'HH24:MI')`;

/**
 * Opening and closing hour parsed from the free-text work time ("Mon–Sun: 12:00–23:00").
 * Slots are whole hours inside working hours, so opening at 07:30 starts at 08:00.
 * Unparsable → 10–22; closing at or before opening (00:00, past midnight) → 24.
 */
const HOURS_RE = String.raw`'(\d{1,2}):(\d{2})\D+(\d{1,2}):\d{2}'`;
export const sqlOpenHour = (workTime: string) =>
  `(SELECT CASE WHEN m IS NULL THEN 10
                ELSE LEAST(m[1]::int + (m[2]::int > 0)::int, 23) END
    FROM regexp_match(${workTime}, ${HOURS_RE}) AS x(m))`;
export const sqlCloseHour = (workTime: string) =>
  `(SELECT CASE WHEN m IS NULL THEN 22
                WHEN m[3]::int <= m[1]::int OR m[3]::int > 24 THEN 24
                ELSE m[3]::int END
    FROM regexp_match(${workTime}, ${HOURS_RE}) AS x(m))`;

/** 'HH:mm' column → minutes since midnight. */
export const sqlMinutes = (time: string) =>
  `(split_part(${time}, ':', 1)::int * 60 + split_part(${time}, ':', 2)::int)`;

/** Booking `b` overlaps [start, end) given in minutes. */
export const sqlOverlaps = (start: string, end: string) =>
  `${sqlMinutes('b.time')} < ${end} AND ${start} < ${sqlMinutes('b.time')} + b.hours * 60`;

export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Hourly start times from opening to the last hour before closing. */
export const slotTimes = (open: number, close: number) =>
  Array.from(
    { length: Math.max(0, close - open) },
    (_, i) => `${String(open + i).padStart(2, '0')}:00`,
  );

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
