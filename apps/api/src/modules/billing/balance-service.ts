import { PaymentModel } from "../payments/payment.model";
import { overduePaymentFilter } from "../payments/payment-status";

/** Students with at least one overdue obligation. Single definition of "debtor". */
export async function studentIdsWithOverdueDebt(organizationId: string, now = new Date()) {
  return PaymentModel.distinct("studentId", { organizationId, ...overduePaymentFilter(now) });
}
