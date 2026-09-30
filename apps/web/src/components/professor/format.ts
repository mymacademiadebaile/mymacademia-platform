import type { BillingMode, BillingType, PaymentReference, SessionPhase } from "./professor-types";

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const DAY_LABEL: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo"
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** All helpers work on plain YYYY-MM-DD strings so the browser timezone never shifts a day. */
export function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day, weekday: new Date(year, month - 1, day).getDay() };
}

export function toDateKey(year: number, month: number, day: number) {
  const value = new Date(year, month - 1, day);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}

export function addDaysKey(date: string, days: number) {
  const { year, month, day } = parseDateKey(date);
  return toDateKey(year, month, day + days);
}

/** Monday of the week containing the date. */
export function startOfWeekKey(date: string) {
  const { weekday } = parseDateKey(date);
  return addDaysKey(date, -((weekday + 6) % 7));
}

/** "Martes 29 de septiembre" */
export function formatLongDate(date: string) {
  const { day, month, weekday } = parseDateKey(date);
  return `${capitalize(WEEKDAYS[weekday])} ${day} de ${MONTHS[month - 1]}`;
}

/** "Mar" */
export function formatWeekdayShort(date: string) {
  return WEEKDAYS_SHORT[parseDateKey(date).weekday];
}

/** "29/09" */
export function formatShortDate(date: string) {
  const { day, month } = parseDateKey(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/** "29/09/2026" */
export function formatFullDate(date: string) {
  return `${formatShortDate(date)}/${parseDateKey(date).year}`;
}

/** "Septiembre 2026" from "2026-09" */
export function formatMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  return `${capitalize(MONTHS[month - 1])} ${year}`;
}

/** dd/mm/aaaa of an ISO instant as seen in Argentina. */
export function formatInstant(value: string) {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
  return formatFullDate(key);
}

export function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

export function formatTimeRange(start: string, end: string) {
  return `${start} – ${end}`;
}

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  PER_CLASS: "Por clase",
  MONTHLY: "Mensual",
  FREE: "Gratis"
};

export const BILLING_MODE_LABEL: Record<BillingMode, string> = {
  PER_CLASS: "Por clase",
  MONTHLY: "Mensual",
  BOTH: "Por clase o mensual",
  FREE: "Gratis"
};

export function priceLabel(item: { billingMode: BillingMode; pricePerClass: number; monthlyPrice: number }) {
  if (item.billingMode === "FREE") return "Gratis";
  if (item.billingMode === "PER_CLASS") return `${formatMoney(item.pricePerClass)} por clase`;
  if (item.billingMode === "MONTHLY") return `${formatMoney(item.monthlyPrice)} por mes`;
  return `${formatMoney(item.pricePerClass)} clase · ${formatMoney(item.monthlyPrice)} mes`;
}

export function referenceLabel(reference: PaymentReference) {
  if (!reference) return "";
  return reference.kind === "MONTH" ? formatMonth(reference.value) : `Clase ${formatShortDate(reference.value)}`;
}

export const PHASE_LABEL: Record<SessionPhase, string> = {
  SCHEDULED: "Programada",
  IN_PROGRESS: "En curso",
  FINISHED: "Finalizada",
  CANCELLED: "Cancelada"
};

/** "Adultos · Inicial" */
export function groupLabel(item: { segments: Array<{ name: string }>; levels: Array<{ name: string }> }) {
  return [...item.segments.map((value) => value.name), ...item.levels.map((value) => value.name)].join(" · ");
}

export function fullName(item: { firstName: string; lastName: string }) {
  return `${item.firstName} ${item.lastName}`.trim();
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** "Lunes y jueves" from the weekly slots of a class. */
export function scheduleDays(schedules: Array<{ day: string }>) {
  const days = [...new Set(schedules.map((slot) => (DAY_LABEL[slot.day] ?? slot.day).toLowerCase()))];
  if (!days.length) return "Sin horario";
  const text = days.length === 1 ? days[0] : `${days.slice(0, -1).join(", ")} y ${days[days.length - 1]}`;
  return capitalize(text);
}
