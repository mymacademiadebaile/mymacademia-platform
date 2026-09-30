export const ACADEMY_TIME_ZONE = "America/Argentina/Buenos_Aires";

const WEEK_DAYS_BY_INDEX = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY"
] as const;

export type WeekDayName = (typeof WEEK_DAYS_BY_INDEX)[number];

const zonedFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

/** Current wall-clock date (YYYY-MM-DD) and time (HH:mm) in Argentina. */
export function academyNow(now = new Date()) {
  const parts = Object.fromEntries(
    zonedFormatter.formatToParts(now).map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

/** Date string (YYYY-MM-DD) of an instant, as seen in Argentina. */
export function academyDateOf(instant: Date) {
  return academyNow(instant).date;
}

/** Week day of a YYYY-MM-DD calendar date. Pure calendar math, no timezone drift. */
export function weekDayFor(date: string): WeekDayName {
  return WEEK_DAYS_BY_INDEX[new Date(date + "T12:00:00.000Z").getUTCDay()];
}

export function addDays(date: string, days: number) {
  const value = new Date(date + "T12:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Inclusive list of YYYY-MM-DD dates between two dates. */
export function dateRange(from: string, to: string) {
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
    if (dates.length > 400) break;
  }
  return dates;
}

/** UTC bounds used to match Payment.classDate (stored at 12:00Z of the class day). */
export function utcDayRange(date: string) {
  const start = new Date(date + "T00:00:00.000Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** Calendar date (YYYY-MM-DD) stored in a Payment.classDate value. */
export function classDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
