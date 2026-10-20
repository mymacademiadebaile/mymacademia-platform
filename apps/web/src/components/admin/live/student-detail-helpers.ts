import type { BillingPreference, DanceClass } from "./live-types";
export { availableMonthlyPlans, defaultMonthlyPlan, monthlyPlansAvailable, monthlyPriceFor } from "./class-detail-helpers";

export function whatsappHref(phone?: string, name?: string) {
  if (!phone) return "";
  const normalized = phone.replace(/\D/g, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(
    `Hola ${name ?? ""}, te escribimos desde M&M Academia de Baile.`
  )}`;
}

export function classBillingMode(danceClass?: DanceClass) {
  return danceClass?.billingMode ?? "MONTHLY";
}

export function defaultBillingPreference(danceClass?: DanceClass): BillingPreference {
  const mode = classBillingMode(danceClass);
  return mode === "MONTHLY" ? "MONTHLY" : "PER_CLASS";
}

export function billingPreferenceLabel(
  danceClass: DanceClass,
  preference?: BillingPreference
) {
  const mode = classBillingMode(danceClass);

  if (mode === "FREE") return "Sin cargo";
  if (mode === "PER_CLASS") return "Por clase";
  if (mode === "MONTHLY") return "Mensual";
  return preference === "MONTHLY" ? "Mensual" : "Por clase";
}

const dayLabels: Record<string, string> = {
  MONDAY: "Lunes", TUESDAY: "Martes", WEDNESDAY: "Miércoles", THURSDAY: "Jueves",
  FRIDAY: "Viernes", SATURDAY: "Sábado", SUNDAY: "Domingo"
};

type ScheduleLike = { day: string; startTime: string; endTime: string };

export function scheduleKey(schedule: ScheduleLike) {
  return `${schedule.day}:${schedule.startTime}:${schedule.endTime}`;
}

export function scheduleLabel(schedule: ScheduleLike) {
  return `${dayLabels[schedule.day] ?? schedule.day} · ${schedule.startTime}–${schedule.endTime}`;
}
