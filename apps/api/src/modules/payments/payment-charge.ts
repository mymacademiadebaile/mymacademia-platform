import type { PaymentType } from "@mym/shared";
import type { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { utcDayRange } from "../../common/dates";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { ACTIVE_CHARGE_INDEX_NAME } from "./active-charge-key";
import { PaymentModel } from "./payment.model";

export function duplicateChargeError(paymentType: PaymentType) {
  return new AppError(
    409,
    paymentType === "PER_CLASS"
      ? "Ya existe un pago para esa clase y fecha"
      : "Ya existe un pago mensual para ese período",
    "PAYMENT_ALREADY_EXISTS"
  );
}

/** True only for a collision on the active-charge unique index (not on other unique fields). */
export function isDuplicateActiveChargeError(error: unknown) {
  const candidate = error as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
  return (
    candidate?.code === 11000 &&
    (candidate.keyPattern?.activeChargeKey !== undefined ||
      String(candidate.message ?? "").includes(ACTIVE_CHARGE_INDEX_NAME))
  );
}

/** Use in .catch() of a Payment create: the unique index lost race becomes the same 409 as the pre-check. */
export function rethrowDuplicateCharge(error: unknown, paymentType: PaymentType): never {
  if (isDuplicateActiveChargeError(error)) throw duplicateChargeError(paymentType);
  throw error;
}

/**
 * Rules shared by every endpoint that registers a charge (manual payment and quick charge).
 * The financial identity of a charge is never its free-text concept:
 *   PER_CLASS -> organization + student + class + class day
 *   MONTHLY   -> organization + student + class + period (YYYY-MM)
 */

/** Student, class and active enrollment must exist in the organization and allow this payment type. */
export async function loadChargeContext(
  organizationId: string,
  ids: { studentId: string; classId: string },
  paymentType: PaymentType
) {
  const [student, danceClass, enrollment] = await Promise.all([
    StudentModel.findOne({ _id: ids.studentId, organizationId, isActive: true }),
    DanceClassModel.findOne({ _id: ids.classId, organizationId, status: "ACTIVE" }),
    EnrollmentModel.findOne({
      organizationId,
      classId: ids.classId,
      studentId: ids.studentId,
      status: "ACTIVE"
    })
  ]);

  if (!student) throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
  if (!danceClass) throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
  if (!enrollment) {
    throw new AppError(422, "El alumno debe estar inscripto en la clase", "PAYMENT_REQUIRES_ACTIVE_ENROLLMENT");
  }
  if (!danceClass.branchId.equals(student.branchId)) {
    throw new AppError(422, "El alumno y la clase deben pertenecer a la misma sede", "PAYMENT_CLASS_BRANCH_MISMATCH");
  }

  const billingMode = danceClass.billingMode ?? "MONTHLY";
  const allowed =
    billingMode === "BOTH" ||
    (billingMode === "PER_CLASS" && paymentType === "PER_CLASS") ||
    (billingMode === "MONTHLY" && paymentType === "MONTHLY");

  if (!allowed) {
    throw new AppError(422, "La modalidad de cobro no está habilitada para esta clase", "PAYMENT_TYPE_NOT_ALLOWED");
  }

  return { student, danceClass, enrollment };
}

/**
 * Canonical dates of a charge. PER_CLASS is identified by its class day (stored at 12:00Z) and its
 * period is always derived from it; MONTHLY is identified by its period.
 */
export function resolveChargeDates(input: {
  paymentType: PaymentType;
  classDate?: string;
  period?: string;
}) {
  if (input.paymentType === "PER_CLASS") {
    const key = input.classDate;
    const classDate = key ? new Date(key + "T12:00:00.000Z") : undefined;

    if (!key || !classDate || Number.isNaN(classDate.getTime()) || classDate.toISOString().slice(0, 10) !== key) {
      throw new AppError(422, "La fecha de la clase no es válida", "INVALID_CLASS_DATE");
    }

    const period = key.slice(0, 7);
    if (input.period && input.period !== period) {
      throw new AppError(422, "El período no coincide con la fecha de la clase", "INVALID_PERIOD");
    }

    return { classDate, classDateKey: key, period };
  }

  if (!input.period) {
    throw new AppError(422, "Indicá el período mensual", "INVALID_PERIOD");
  }

  return { classDate: undefined, classDateKey: undefined, period: input.period };
}

/** Rejects a second non-cancelled payment (PENDING, PAID or OVERDUE) for the same logical charge. */
export async function assertNoActiveDuplicate(input: {
  organizationId: string;
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  paymentType: PaymentType;
  sessionId?: Types.ObjectId;
  classDateKey?: string;
  period: string;
}) {
  const filter: Record<string, unknown> = {
    organizationId: input.organizationId,
    studentId: input.studentId,
    classId: input.classId,
    paymentType: input.paymentType,
    status: { $ne: "CANCELLED" }
  };

  if (input.paymentType === "PER_CLASS") {
    if (input.sessionId) {
      filter.sessionId = input.sessionId;
    } else {
      const { start, end } = utcDayRange(input.classDateKey!);
      filter.classDate = { $gte: start, $lt: end };
    }
  } else {
    filter.period = input.period;
  }

  if (await PaymentModel.exists(filter)) throw duplicateChargeError(input.paymentType);

  // A monthly fee already covers every class of its month: charging a class of that month too
  // would bill the student twice for the same session.
  if (input.paymentType === "PER_CLASS") {
    const coveredByMonthly = await PaymentModel.exists({
      organizationId: input.organizationId,
      studentId: input.studentId,
      classId: input.classId,
      paymentType: "MONTHLY",
      period: input.period,
      status: { $ne: "CANCELLED" }
    });
    if (coveredByMonthly) {
      throw new AppError(
        409,
        "El alumno ya tiene la mensualidad de ese mes, que incluye esta clase",
        "COVERED_BY_MONTHLY"
      );
    }
  }
}
