import { isPastCalendarDay, overdueCutoff } from "../../common/dates";

/**
 * Status of a legacy Payment as users see it. A PENDING payment becomes OVERDUE only after its
 * due day has ended in Argentina: a fee due today is still pending today.
 */
export function effectivePaymentStatus(payment: { status: string; dueDate: Date }) {
  if (payment.status === "PENDING" && isPastCalendarDay(payment.dueDate)) return "OVERDUE";
  return payment.status;
}

/** MongoDB filter for overdue legacy payments (same rule as effectivePaymentStatus). */
export function overduePaymentFilter(now = new Date()) {
  return {
    $or: [
      { status: "OVERDUE" },
      { status: "PENDING", dueDate: { $lt: overdueCutoff(now) } }
    ]
  };
}

/** MongoDB filter for pending legacy payments that are not due yet. */
export function notYetDuePaymentFilter(now = new Date()) {
  return { status: "PENDING", dueDate: { $gte: overdueCutoff(now) } };
}
