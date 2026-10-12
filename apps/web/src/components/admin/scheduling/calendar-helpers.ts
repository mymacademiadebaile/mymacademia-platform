import { addDays, formatDateOnly } from "@/lib/dates";
import type { Branch, CatalogItem, DanceClass, Professor } from "../live/live-types";
import type { CalendarSession, DanceSpace } from "./scheduling-types";

export type View = "month" | "week" | "day" | "list";
export type PendingSessionMove = { session: CalendarSession; date: string };
export type ScheduleDraft = { day: string; startTime: string; endTime: string };
export type CalendarFilters = { professorId: string; disciplineId: string; classId: string; spaceId: string; status: string };
export type CalendarOptions = {
  branches: Branch[];
  professors: Professor[];
  disciplines: CatalogItem[];
  segments: CatalogItem[];
  levels: CatalogItem[];
  classes: DanceClass[];
  spaces: DanceSpace[];
};

export const VIEW_LABEL: Record<View, string> = { month: "Mes", week: "Semana", day: "Día", list: "Lista" };
export const WEEK_HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const PALETTE = ["#6d28d9", "#db2777", "#0891b2", "#ea580c", "#16a34a", "#4f46e5", "#ca8a04", "#be123c"];
export const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo"
};
export const EMPTY_FILTERS: CalendarFilters = { professorId: "", disciplineId: "", classId: "", spaceId: "", status: "" };
export const EMPTY_OPTIONS: CalendarOptions = { branches: [], professors: [], disciplines: [], segments: [], levels: [], classes: [], spaces: [] };
export const DEFAULT_SCHEDULE: ScheduleDraft = { day: "MONDAY", startTime: "18:00", endTime: "19:00" };

function weekdayIndex(date: string) {
  // Monday = 0 ... Sunday = 6
  return (new Date(date + "T12:00:00.000Z").getUTCDay() + 6) % 7;
}

export function startOfWeek(date: string) {
  return addDays(date, -weekdayIndex(date));
}

export function rangeFor(view: View, anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (view === "list") return { from: anchor, to: addDays(anchor, 13) };
  const first = anchor.slice(0, 7) + "-01";
  const from = startOfWeek(first);
  const nextMonth = new Date(first + "T12:00:00.000Z");
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const last = addDays(nextMonth.toISOString().slice(0, 10), -1);
  return { from, to: addDays(startOfWeek(last), 6) };
}

export function move(view: View, anchor: string, direction: 1 | -1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "list") return addDays(anchor, 14 * direction);
  const value = new Date(anchor.slice(0, 7) + "-01T12:00:00.000Z");
  value.setUTCMonth(value.getUTCMonth() + direction);
  return value.toISOString().slice(0, 10);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function rangeLabel(view: View, anchor: string, from: string, to: string) {
  if (view === "month") return capitalize(formatDateOnly(anchor, { month: "long", year: "numeric" }));
  if (view === "day") return capitalize(formatDateOnly(anchor, { weekday: "long", day: "numeric", month: "long" }));
  return `${formatDateOnly(from, { day: "numeric", month: "short" })} – ${formatDateOnly(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

export function hourAfter(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours >= 23) return "23:59";
  return `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}
