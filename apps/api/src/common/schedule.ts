import { addDays, weekDayFor } from "./dates";

export interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}

export interface Occurrence {
  date: string;
  startTime: string;
  endTime: string;
}

/** Every weekly slot occurrence between two YYYY-MM-DD dates (inclusive), sorted. */
export function occurrencesBetween(
  schedules: ScheduleSlot[],
  from: string,
  to: string
): Occurrence[] {
  const result: Occurrence[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = weekDayFor(date);
    for (const slot of schedules) {
      if (slot.day === day) {
        result.push({ date, startTime: slot.startTime, endTime: slot.endTime });
      }
    }
  }
  return result.sort((a, b) =>
    (a.date + a.startTime).localeCompare(b.date + b.startTime)
  );
}

/** First occurrence that has not finished yet at the given Argentina wall-clock time. */
export function nextOccurrence(
  schedules: ScheduleSlot[],
  now: { date: string; time: string }
): Occurrence | undefined {
  if (!schedules.length) return undefined;
  return occurrencesBetween(schedules, now.date, addDays(now.date, 7)).find(
    (item) => item.date > now.date || item.endTime > now.time
  );
}

/** Most recent occurrence that already started on or before the given time. */
export function lastOccurrence(
  schedules: ScheduleSlot[],
  now: { date: string; time: string }
): Occurrence | undefined {
  if (!schedules.length) return undefined;
  return occurrencesBetween(schedules, addDays(now.date, -7), now.date)
    .filter((item) => item.date < now.date || item.startTime <= now.time)
    .pop();
}

export function minutesBetween(startTime: string, endTime: string) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

/** Monday..Sunday bounds of the week containing the date. */
export function weekBounds(date: string) {
  const day = weekDayFor(date);
  const offsets: Record<string, number> = {
    MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4, SATURDAY: 5, SUNDAY: 6
  };
  const from = addDays(date, -offsets[day]);
  return { from, to: addDays(from, 6) };
}
