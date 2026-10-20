import type { BillingMode, BillingPreference, DanceClass } from "./live-types";

export const dayLabels: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo"
};

export function refId(value: { _id: string } | string) {
  return typeof value === "string" ? value : value._id;
}

export function refName(value: { name?: string; displayName?: string } | string) {
  return typeof value === "string" ? value : value.displayName ?? value.name ?? "Sin nombre";
}

export function normalizedMode(danceClass: DanceClass): BillingMode {
  return danceClass.billingMode ?? "MONTHLY";
}

export function billingLabel(danceClass: DanceClass) {
  const mode = normalizedMode(danceClass);
  if (mode === "FREE") return "Sin cargo";
  if (mode === "PER_CLASS") return "$ " + (danceClass.pricePerClass ?? 0).toLocaleString("es-AR") + " por clase";
  if (mode === "MONTHLY") return monthlyPlansLabel(danceClass);
  return "$ " + (danceClass.pricePerClass ?? 0).toLocaleString("es-AR") + " por clase o " + monthlyPlansLabel(danceClass);
}

export function availableMonthlyPlans(danceClass: DanceClass): Array<4 | 8> {
  const plans: Array<4 | 8> = [];
  if (danceClass.monthlyPrice4 && danceClass.monthlyPrice4 > 0) plans.push(4);
  if (danceClass.monthlyPrice8 && danceClass.monthlyPrice8 > 0) plans.push(8);
  return plans;
}

export function monthlyPlansAvailable(danceClass: DanceClass) {
  return availableMonthlyPlans(danceClass).length > 0;
}

export function defaultMonthlyPlan(danceClass: DanceClass): 4 | 8 {
  return availableMonthlyPlans(danceClass)[0] ?? 4;
}

export function monthlyPriceFor(danceClass: DanceClass, plan: 4 | 8 = defaultMonthlyPlan(danceClass)) {
  return plan === 8
    ? danceClass.monthlyPrice8 ?? danceClass.monthlyPrice ?? 0
    : danceClass.monthlyPrice4 ?? danceClass.monthlyPrice ?? 0;
}

export function monthlyPlansLabel(danceClass: DanceClass) {
  if (!monthlyPlansAvailable(danceClass)) return "$ " + (danceClass.monthlyPrice ?? 0).toLocaleString("es-AR") + " mensual";
  return availableMonthlyPlans(danceClass)
    .map((plan) => "$ " + monthlyPriceFor(danceClass, plan).toLocaleString("es-AR") + " / " + plan + " clases")
    .join(" · ");
}

export function preferenceForClass(danceClass: DanceClass): BillingPreference | undefined {
  const mode = normalizedMode(danceClass);
  if (mode === "PER_CLASS") return "PER_CLASS";
  if (mode === "MONTHLY") return "MONTHLY";
  if (mode === "BOTH") return "PER_CLASS";
  return undefined;
}

export function preferenceLabel(preference?: BillingPreference) {
  if (preference === "MONTHLY") return "Mensual";
  if (preference === "PER_CLASS") return "Por clase";
  return "Sin cargo";
}
