import { AppError } from "../../common/http/app-error";

export type MonthlyPlan = 4 | 8;

type MonthlyPrices = {
  monthlyPrice?: number;
  monthlyPrice4?: number | null;
  monthlyPrice8?: number | null;
};

export function availableMonthlyPlans(danceClass: MonthlyPrices): MonthlyPlan[] {
  const plans: MonthlyPlan[] = [];
  if (danceClass.monthlyPrice4 && danceClass.monthlyPrice4 > 0) plans.push(4);
  if (danceClass.monthlyPrice8 && danceClass.monthlyPrice8 > 0) plans.push(8);
  return plans;
}

export function resolveMonthlyPlan(danceClass: MonthlyPrices, requested?: MonthlyPlan): MonthlyPlan | undefined {
  const available = availableMonthlyPlans(danceClass);
  if (requested !== undefined && available.length > 0 && !available.includes(requested)) {
    throw new AppError(422, `Esta clase no ofrece el plan mensual de ${requested} clases`, "MONTHLY_PLAN_NOT_AVAILABLE");
  }
  return requested ?? available[0];
}
