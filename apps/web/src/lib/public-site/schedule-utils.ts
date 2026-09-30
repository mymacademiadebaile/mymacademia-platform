/**
 * Pure helpers for the public schedule. No runtime imports so they can be unit
 * tested with `node --test` directly.
 */
import type {
  DanceStyle,
  PublicClass,
  PublicProfessor,
  PublicScheduleSlot,
  ScheduleEntry,
  UpcomingClass,
  WeekDay
} from "./types";

export const WEEK_ORDER: WeekDay[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY"
];

export const DAY_LABELS: Record<WeekDay, { long: string; short: string }> = {
  MONDAY: { long: "Lunes", short: "Lun" },
  TUESDAY: { long: "Martes", short: "Mar" },
  WEDNESDAY: { long: "Miércoles", short: "Mié" },
  THURSDAY: { long: "Jueves", short: "Jue" },
  FRIDAY: { long: "Viernes", short: "Vie" },
  SATURDAY: { long: "Sábado", short: "Sáb" },
  SUNDAY: { long: "Domingo", short: "Dom" }
};

export function resolveSchedule(
  slots: PublicScheduleSlot[],
  classes: PublicClass[],
  styles: DanceStyle[],
  professors: PublicProfessor[]
): ScheduleEntry[] {
  const classById = new Map(classes.map((item) => [item.id, item]));
  const styleBySlug = new Map(styles.map((item) => [item.slug, item]));
  const professorBySlug = new Map(professors.map((item) => [item.slug, item]));

  const entries: ScheduleEntry[] = [];
  for (const slot of slots) {
    const danceClass = classById.get(slot.classId);
    const style = danceClass ? styleBySlug.get(danceClass.styleSlug) : undefined;
    if (!danceClass || !style) continue;
    entries.push({
      slotId: slot.id,
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      className: danceClass.name,
      style: { slug: style.slug, seoSlug: style.seoSlug, name: style.name },
      professors: danceClass.professorSlugs
        .map((slug) => professorBySlug.get(slug))
        .filter((item): item is PublicProfessor => Boolean(item))
        .map(({ slug, displayName }) => ({ slug, displayName })),
      levels: danceClass.levels
    });
  }
  return sortEntries(entries);
}

export function sortEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  return [...entries].sort(
    (a, b) =>
      WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime)
  );
}

export function groupByDay(entries: ScheduleEntry[], days: WeekDay[]): { day: WeekDay; entries: ScheduleEntry[] }[] {
  return days.map((day) => ({ day, entries: entries.filter((entry) => entry.day === day) }));
}

/** Current weekday, date and HH:mm in the given IANA time zone. */
export function zonedNow(now: Date, timeZone: string): { day: WeekDay; date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return {
    day: String(parts.weekday).toUpperCase() as WeekDay,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Next classes from `now`, derived from the weekly schedule. A class stays listed
 * until it ends. Will be replaced by real ClassSession data (cancellations, holidays).
 */
export function upcomingFromSchedule(
  entries: ScheduleEntry[],
  now: Date,
  timeZone: string,
  limit = 3
): UpcomingClass[] {
  if (entries.length === 0) return [];
  const today = zonedNow(now, timeZone);
  const todayIndex = WEEK_ORDER.indexOf(today.day);
  const result: UpcomingClass[] = [];

  // 8 days: today plus a full week, so today's weekday is covered again next week.
  for (let offset = 0; offset < 8 && result.length < limit; offset += 1) {
    const day = WEEK_ORDER[(todayIndex + offset) % 7];
    const dayEntries = sortEntries(entries.filter((entry) => entry.day === day)).filter(
      (entry) => offset > 0 || entry.endTime > today.time
    );
    for (const entry of dayEntries) {
      if (result.length >= limit) break;
      result.push({ entry, date: addDays(today.date, offset), daysFromToday: offset });
    }
  }
  return result;
}

export function relativeDayLabel(item: UpcomingClass): string {
  if (item.daysFromToday === 0) return "Hoy";
  if (item.daysFromToday === 1) return "Mañana";
  return DAY_LABELS[item.entry.day].long;
}
