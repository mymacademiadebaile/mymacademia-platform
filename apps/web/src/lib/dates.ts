/** The academy operates in Argentina: "today" and calendar days never follow the browser zone. */
export const ACADEMY_TIME_ZONE = "America/Argentina/Buenos_Aires";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/** Today's date (YYYY-MM-DD) in Argentina. */
export function todayInArgentina(now = new Date()) {
  return dayFormatter.format(now);
}

/** Calendar day (YYYY-MM-DD) of an instant, as seen in Argentina. */
export function argentinaDateOf(value: string | Date) {
  return dayFormatter.format(typeof value === "string" ? new Date(value) : value);
}

/**
 * Formats a date-only value (birth date, due date, class date). The API stores them at 12:00Z
 * (older records at 00:00Z), so the UTC calendar day is the intended one.
 */
export function formatDateOnly(value?: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  const day = value.slice(0, 10);
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("es-AR", { timeZone: "UTC", ...options });
}

/** Formats an instant (payment received, audit event) in Argentina time. */
export function formatInstant(value?: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", { timeZone: ACADEMY_TIME_ZONE, ...options });
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
