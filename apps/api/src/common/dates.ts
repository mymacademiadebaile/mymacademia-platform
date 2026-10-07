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

export const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const zonedFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function zonedParts(instant: Date) {
  return Object.fromEntries(
    zonedFormatter.formatToParts(instant).map((part) => [part.type, part.value])
  ) as Record<string, string>;
}

/** Current wall-clock date (YYYY-MM-DD) and time (HH:mm) in Argentina. */
export function academyNow(now = new Date()) {
  const parts = zonedParts(now);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

/** Date string (YYYY-MM-DD) of an instant, as seen in Argentina. */
export function academyDateOf(instant: Date) {
  return academyNow(instant).date;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !CALENDAR_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(value + "T12:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string) {
  return Math.round(
    (new Date(to + "T12:00:00.000Z").getTime() - new Date(from + "T12:00:00.000Z").getTime()) /
      86_400_000
  );
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

/** Calendar date (YYYY-MM-DD) stored in a date-only Date (12:00Z, or 00:00Z in old records). */
export function classDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * A calendar date stored in a `Date` field. Noon UTC is the same calendar day in every
 * timezone of the Americas, so `classDateKey` reads it back unchanged.
 */
export function calendarDateToDate(date: string) {
  return new Date(date + "T12:00:00.000Z");
}

/** Offset in minutes between Argentina wall-clock time and UTC at a given instant. */
function academyOffsetMinutes(instant: Date) {
  const parts = zonedParts(instant);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Instant of a wall-clock date and time in Argentina. */
export function academyInstant(date: string, time = "00:00") {
  const naive = new Date(`${date}T${time}:00.000Z`);
  const offset = academyOffsetMinutes(naive);
  return new Date(naive.getTime() - offset * 60_000);
}

/** UTC instants bounding one Argentina calendar day: [start, end). */
export function academyDayBounds(date: string) {
  return { start: academyInstant(date), end: academyInstant(addDays(date, 1)) };
}

/** UTC instants bounding an inclusive range of Argentina calendar days: [start, end). */
export function academyRangeBounds(from: string, to: string) {
  return { start: academyInstant(from), end: academyInstant(addDays(to, 1)) };
}

/**
 * Date-only values (dueDate, classDate) earlier than this instant belong to a calendar day that
 * already ended in Argentina. A charge due today is not overdue until tomorrow.
 */
export function overdueCutoff(now = new Date()) {
  return new Date(academyNow(now).date + "T00:00:00.000Z");
}

/** True when a date-only value refers to a day before today in Argentina. */
export function isPastCalendarDay(value: Date | string, now = new Date()) {
  const key = typeof value === "string" ? value : classDateKey(value);
  return key < academyNow(now).date;
}

/** YYYY-MM of a calendar date. */
export function periodOf(date: string) {
  return date.slice(0, 7);
}

export function daysInPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First and last calendar day of a YYYY-MM period. */
export function periodBounds(period: string) {
  return {
    from: `${period}-01`,
    to: `${period}-${String(daysInPeriod(period)).padStart(2, "0")}`
  };
}

export function addMonths(period: string, months: number) {
  const [year, month] = period.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, 1));
  return value.toISOString().slice(0, 7);
}

/**
 * A calendar day typed by a user ("YYYY-MM-DD") or a full ISO instant, normalized to the
 * date-only convention (12:00Z). Full instants are first read as an Argentina calendar day.
 */
export function toDateOnly(value: string | Date) {
  if (typeof value === "string" && CALENDAR_DATE_PATTERN.test(value)) return calendarDateToDate(value);
  const instant = value instanceof Date ? value : new Date(value);
  return calendarDateToDate(academyDateOf(instant));
}

/**
 * When money was received. A bare calendar day means "that day": today keeps the current time,
 * any other day becomes noon in Argentina so it can never slip into the previous or next day.
 */
export function toReceivedAt(value: string | Date | undefined, now = new Date()) {
  if (value === undefined) return now;
  if (typeof value === "string" && CALENDAR_DATE_PATTERN.test(value)) {
    return value === academyNow(now).date ? now : academyInstant(value, "12:00");
  }
  return value instanceof Date ? value : new Date(value);
}
