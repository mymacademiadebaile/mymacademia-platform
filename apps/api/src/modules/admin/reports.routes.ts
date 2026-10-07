import ExcelJS from "exceljs";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { toPesos } from "../../common/money";
import { chargeState } from "../billing/balance-service";
import { ChargeModel } from "../billing/charge.model";
import { CollectionModel } from "../billing/collection.model";
import { legacyPaymentToChargeView, unmirroredLegacyPayments, type ChargeView } from "../billing/legacy-adapter";
import { PaymentAllocationModel } from "../billing/payment-allocation.model";
import { RefundModel } from "../billing/refund.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";
import { academyNow, academyRangeBounds } from "../../common/dates";
import { objectIdSchema } from "./admin.schemas";

const calendarDateSchema = z.string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/)
  .refine((value) => new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value, {
    message: "La fecha no es válida"
  });
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const reportQuerySchema = z.object({
  /** Kept for dashboard and old links. New report screens use a calendar range. */
  period: periodSchema.optional(),
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  branchId: objectIdSchema.optional()
}).superRefine((value, context) => {
  const hasRange = Boolean(value.from || value.to);

  if (hasRange && (!value.from || !value.to)) {
    context.addIssue({
      code: "custom",
      path: value.from ? ["to"] : ["from"],
      message: "Indicá la fecha de inicio y la fecha de fin"
    });
  }

  if (hasRange && value.period) {
    context.addIssue({
      code: "custom",
      path: ["period"],
      message: "Elegí un período mensual o un rango de fechas, no ambos"
    });
  }

  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "La fecha de fin debe ser posterior a la de inicio"
    });
  }

  if (value.from && value.to && calendarDaysBetween(value.from, value.to) > 366) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: "El rango máximo para un reporte es de 366 días"
    });
  }
});

type DateRange = {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
  periods: string[];
};

type FinancialBucket = {
  amount: number;
  count: number;
};

type FinancialSummary = {
  totalAmount: number;
  count: number;
  collectedAmount: number;
  paidCount: number;
  pendingAmount: number;
  pendingCount: number;
  overdueAmount: number;
  overdueCount: number;
  cancelledAmount: number;
  cancelledCount: number;
};

const PAYMENT_TYPES = ["PER_CLASS", "MONTHLY"] as const;

function currentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function calendarDaysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00.000Z`).getTime();
  const end = new Date(`${to}T12:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

function daysInMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthPeriodsBetween(from: string, to: string) {
  const periods: string[] = [];
  let [year, month] = from.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = to.slice(0, 7).split("-").map(Number);

  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return periods;
}

function rangeFor(query: z.infer<typeof reportQuerySchema>): DateRange {
  const period = query.period ?? currentPeriod();
  const from = query.from ?? `${period}-01`;
  const to = query.to ?? `${period}-${String(daysInMonth(period)).padStart(2, "0")}`;
  // Instants (paidAt, createdAt) belong to the Argentina calendar day they happened on, so a
  // payment at 22:30 on the last day of the month never lands in the next month.
  const bounds = academyRangeBounds(from, to);

  return {
    from,
    to,
    start: bounds.start,
    endExclusive: bounds.end,
    periods: monthPeriodsBetween(from, to)
  };
}


function emptyFinancialSummary(): FinancialSummary {
  return {
    totalAmount: 0,
    count: 0,
    collectedAmount: 0,
    paidCount: 0,
    pendingAmount: 0,
    pendingCount: 0,
    overdueAmount: 0,
    overdueCount: 0,
    cancelledAmount: 0,
    cancelledCount: 0
  };
}

/**
 * Status of charges whose academic occurrence/month belongs to the selected range.
 * This is deliberately different from cash: a September monthly fee paid in October
 * belongs here in September, but in cash in October. States come from chargeState, the same
 * rule every other screen uses (partial payments count as collected and pending).
 */
function summarizeIssuedCharges(charges: ChargeView[], today: string) {
  return charges.reduce((summary, charge) => {
    const state = chargeState(charge, today);
    const owed = toPesos(state.owedCents);

    if (state.status === "VOID") {
      summary.cancelledAmount += toPesos(charge.amountCents);
      summary.cancelledCount += 1;
      return summary;
    }

    summary.totalAmount += owed;
    summary.count += 1;
    summary.collectedAmount += toPesos(state.paidCents);

    if (state.status === "PAID") {
      summary.paidCount += 1;
    } else if (state.status === "OVERDUE") {
      summary.overdueAmount += toPesos(state.balanceCents);
      summary.overdueCount += 1;
    } else {
      summary.pendingAmount += toPesos(state.balanceCents);
      summary.pendingCount += 1;
    }

    return summary;
  }, emptyFinancialSummary());
}

function emptyBucket(): FinancialBucket {
  return { amount: 0, count: 0 };
}

function addToBucket(bucket: FinancialBucket, amount: number) {
  bucket.amount += amount;
  bucket.count += 1;
}

function dateForExcel(value: string) {
  return value.split("-").reverse().join("/");
}

async function buildOverview(
  organizationId: string,
  query: z.infer<typeof reportQuerySchema>
) {
  const range = rangeFor(query);
  const branchFilter = query.branchId ? { branchId: query.branchId } : {};
  const organizationObjectId = new Types.ObjectId(organizationId);

  const today = academyNow().date;
  const scope = { organizationId, ...branchFilter };
  const legacyIssuedFilter = {
    ...scope,
    $or: [
      { paymentType: "PER_CLASS", classDate: { $gte: range.start, $lt: range.endExclusive } },
      // Old manual per-class charges may not have classDate: their period is the best key.
      { paymentType: "PER_CLASS", classDate: { $exists: false }, period: { $in: range.periods } },
      { paymentType: "MONTHLY", period: { $in: range.periods } }
    ]
  };
  const chargeIssuedFilter = {
    ...scope,
    $or: [
      { kind: "CLASS_FEE", serviceDate: { $gte: range.from, $lte: range.to } },
      { kind: "CLASS_FEE", serviceDate: { $exists: false }, period: { $in: range.periods } },
      { kind: { $in: ["MONTHLY_FEE", "OTHER"] }, period: { $in: range.periods } }
    ]
  };

  const sessionFilter = {
    organizationId,
    ...branchFilter,
    sessionDate: { $gte: range.from, $lte: range.to }
  };

  const classFilter = { organizationId, ...branchFilter };
  const studentFilter = { organizationId, isActive: true, ...branchFilter };

  const [students, newStudents, classes, issuedCharges, legacyIssued, cash, sessions] = await Promise.all([
    StudentModel.countDocuments(studentFilter),
    StudentModel.countDocuments({
      ...studentFilter,
      createdAt: { $gte: range.start, $lt: range.endExclusive }
    }),
    DanceClassModel.find(classFilter)
      .select("name branchId capacity billingMode disciplineIds professorIds status")
      .populate("disciplineIds", "name")
      .lean(),
    ChargeModel.find(chargeIssuedFilter).lean<ChargeView[]>(),
    unmirroredLegacyPayments(legacyIssuedFilter),
    cashMovements(organizationId, range, query.branchId),
    ClassSessionModel.find(sessionFilter)
      .select("classId sessionDate status")
      .lean()
  ]);

  const activeClasses = classes.filter((danceClass: any) => danceClass.status === "ACTIVE");
  const activeClassIds = activeClasses.map((danceClass: any) => danceClass._id);
  const enrollmentGroups = activeClassIds.length
    ? await EnrollmentModel.aggregate<{ _id: Types.ObjectId; occupied: number }>([
        {
          $match: {
            organizationId: organizationObjectId,
            classId: { $in: activeClassIds },
            status: "ACTIVE"
          }
        },
        { $group: { _id: "$classId", occupied: { $sum: 1 } } }
      ])
    : [];

  const sessionIds = sessions.map((session: any) => session._id);
  const attendance = sessionIds.length
    ? await ClassAttendanceModel.find({
        organizationId,
        sessionId: { $in: sessionIds }
      })
        .select("sessionId status")
        .lean()
    : [];

  const occupiedByClass = new Map(
    enrollmentGroups.map((item) => [String(item._id), item.occupied])
  );
  const classById = new Map(classes.map((danceClass: any) => [String(danceClass._id), danceClass]));

  const occupancy = activeClasses
    .map((danceClass: any) => {
      const occupied = occupiedByClass.get(String(danceClass._id)) ?? 0;
      const disciplines = (danceClass.disciplineIds ?? [])
        .map((item: unknown) =>
          item && typeof item === "object" && "name" in item
            ? String((item as { name: string }).name)
            : ""
        )
        .filter(Boolean);
      return {
        id: String(danceClass._id),
        name: danceClass.name,
        capacity: danceClass.capacity,
        occupied,
        available: Math.max(0, danceClass.capacity - occupied),
        occupancyPercent: danceClass.capacity ? Math.round((occupied / danceClass.capacity) * 100) : 0,
        disciplines
      };
    })
    .sort((a, b) => b.occupancyPercent - a.occupancyPercent || a.name.localeCompare(b.name));

  const issued: ChargeView[] = [...issuedCharges, ...legacyIssued.map(legacyPaymentToChargeView)];
  const typeOf = (charge: ChargeView) => (charge.kind === "MONTHLY_FEE" ? "MONTHLY" : "PER_CLASS");
  const financial = summarizeIssuedCharges(issued, today);
  const issuedByType = PAYMENT_TYPES.map((paymentType) => ({
    paymentType,
    ...summarizeIssuedCharges(issued.filter((charge) => typeOf(charge) === paymentType), today)
  }));

  const cashByType = new Map<string, FinancialBucket>();
  const cashByMethod = new Map<string, FinancialBucket>();
  for (const movement of cash.entries) {
    const typeBucket = cashByType.get(movement.paymentType) ?? emptyBucket();
    addToBucket(typeBucket, movement.amount);
    cashByType.set(movement.paymentType, typeBucket);

    const methodBucket = cashByMethod.get(movement.method) ?? emptyBucket();
    addToBucket(methodBucket, movement.amount);
    cashByMethod.set(movement.method, methodBucket);
  }

  const performance = new Map<string, {
    id: string;
    name: string;
    billingMode: string;
    capacity: number;
    sessions: { total: number; completed: number; scheduled: number; cancelled: number };
    attendance: { present: number; absent: number; expected: number; recorded: number };
    invoiced: FinancialBucket;
    collected: FinancialBucket;
    occupancy: { occupied: number; percent: number };
  }>();

  function classPerformance(classId: string) {
    const existing = performance.get(classId);
    if (existing) return existing;

    const danceClass: any = classById.get(classId);
    const capacity = danceClass?.capacity ?? 0;
    const occupied = occupiedByClass.get(classId) ?? 0;
    const item = {
      id: classId,
      name: danceClass?.name ?? "Clase sin nombre",
      billingMode: danceClass?.billingMode ?? "MONTHLY",
      capacity,
      sessions: { total: 0, completed: 0, scheduled: 0, cancelled: 0 },
      attendance: { present: 0, absent: 0, expected: 0, recorded: 0 },
      invoiced: emptyBucket(),
      collected: emptyBucket(),
      occupancy: {
        occupied,
        percent: capacity ? Math.round((occupied / capacity) * 100) : 0
      }
    };
    performance.set(classId, item);
    return item;
  }

  const sessionClassById = new Map<string, string>();
  const activity = {
    sessions: sessions.length,
    completedSessions: 0,
    scheduledSessions: 0,
    cancelledSessions: 0,
    attendance: { present: 0, absent: 0, expected: 0, recorded: 0 }
  };

  for (const session of sessions as Array<any>) {
    const item = classPerformance(String(session.classId));
    sessionClassById.set(String(session._id), String(session.classId));
    item.sessions.total += 1;
    if (session.status === "COMPLETED") {
      item.sessions.completed += 1;
      activity.completedSessions += 1;
    } else if (session.status === "CANCELLED") {
      item.sessions.cancelled += 1;
      activity.cancelledSessions += 1;
    } else {
      item.sessions.scheduled += 1;
      activity.scheduledSessions += 1;
    }
  }

  for (const record of attendance as Array<any>) {
    const classId = sessionClassById.get(String(record.sessionId));
    if (!classId) continue;
    const item = classPerformance(classId);
    item.attendance.recorded += 1;
    activity.attendance.recorded += 1;
    if (record.status === "PRESENT") {
      item.attendance.present += 1;
      activity.attendance.present += 1;
    } else if (record.status === "ABSENT") {
      item.attendance.absent += 1;
      activity.attendance.absent += 1;
    } else {
      item.attendance.expected += 1;
      activity.attendance.expected += 1;
    }
  }

  for (const charge of issued) {
    if (charge.status === "VOID" || !charge.classId) continue;
    addToBucket(classPerformance(String(charge.classId)).invoiced, toPesos(chargeState(charge, today).owedCents));
  }

  for (const movement of cash.entries) {
    if (!movement.classId) continue;
    addToBucket(classPerformance(movement.classId).collected, movement.amount);
  }

  const classPerformanceRows = [...performance.values()]
    .sort(
      (a, b) =>
        b.collected.amount - a.collected.amount ||
        b.invoiced.amount - a.invoiced.amount ||
        b.sessions.total - a.sessions.total ||
        a.name.localeCompare(b.name)
    );

  const activeProfessorIds = new Set(
    activeClasses.flatMap((danceClass: any) => (danceClass.professorIds ?? []).map(String))
  );
  const professors = activeProfessorIds.size
    ? await ProfessorModel.countDocuments({
        organizationId,
        isActive: true,
        _id: { $in: [...activeProfessorIds] }
      })
    : 0;

  const cashTotal = [...cashByType.values()].reduce((total, item) => total + item.amount, 0);
  const cashCount = [...cashByType.values()].reduce((total, item) => total + item.count, 0);

  return {
    // `period`, `financial`, `classes` and `occupancy` remain for the dashboard API contract.
    period: range.periods.length === 1 ? range.periods[0] : `${range.from} a ${range.to}`,
    range: {
      from: range.from,
      to: range.to,
      periods: range.periods,
      days: calendarDaysBetween(range.from, range.to)
    },
    students: {
      active: students,
      newInPeriod: newStudents,
      newInRange: newStudents
    },
    professors: { active: professors },
    classes: {
      active: activeClasses.length,
      totalCapacity: occupancy.reduce((sum, item) => sum + item.capacity, 0),
      occupied: occupancy.reduce((sum, item) => sum + item.occupied, 0)
    },
    financial,
    billing: {
      issued: financial,
      byPaymentType: issuedByType
    },
    cash: {
      collectedAmount: cashTotal,
      paidCount: cashCount,
      refundedAmount: cash.refunded,
      netAmount: cashTotal - cash.refunded,
      byPaymentType: PAYMENT_TYPES.map((paymentType) => ({
        paymentType,
        ...(cashByType.get(paymentType) ?? emptyBucket())
      })),
      byMethod: [...cashByMethod.entries()]
        .map(([paymentMethod, values]) => ({ paymentMethod, ...values }))
        .sort((a, b) => b.amount - a.amount)
    },
    activity,
    classPerformance: classPerformanceRows,
    occupancy
  };
}

/**
 * Money received in the range, by Argentina accounting day: collections of the new model
 * (split by the charges they paid) plus legacy paid payments not mirrored yet. Refunds are
 * reported separately, on the day they happened.
 */
async function cashMovements(organizationId: string, range: DateRange, branchId?: string) {
  const scope = { organizationId, ...(branchId ? { branchId } : {}) };
  const [collections, legacyPaid, refunds] = await Promise.all([
    CollectionModel.find({ ...scope, accountingDate: { $gte: range.from, $lte: range.to } }).lean<any[]>(),
    unmirroredLegacyPayments({ ...scope, status: "PAID", paidAt: { $gte: range.start, $lt: range.endExclusive } }),
    RefundModel.find({ ...scope, accountingDate: { $gte: range.from, $lte: range.to } }).select("amountCents").lean<any[]>()
  ]);
  const allocations = collections.length
    ? await PaymentAllocationModel.find({ collectionId: { $in: collections.map((item) => item._id) } }).lean<any[]>()
    : [];
  const charges = allocations.length
    ? await ChargeModel.find({ _id: { $in: allocations.map((item) => item.chargeId) } }).select("kind classId").lean<any[]>()
    : [];
  const chargeById = new Map(charges.map((item) => [String(item._id), item]));

  const entries: Array<{ amount: number; method: string; paymentType: string; classId?: string }> = [];
  for (const collection of collections) {
    const own = allocations.filter((item) => item.collectionId.equals(collection._id));
    let rest = collection.amountCents;
    for (const allocation of own) {
      const charge = chargeById.get(String(allocation.chargeId));
      rest -= allocation.amountCents;
      entries.push({
        amount: toPesos(allocation.amountCents),
        method: collection.method,
        paymentType: charge?.kind === "MONTHLY_FEE" ? "MONTHLY" : "PER_CLASS",
        classId: charge?.classId ? String(charge.classId) : undefined
      });
    }
    // Money received and left as credit (not applied to any charge yet).
    if (rest > 0) entries.push({ amount: toPesos(rest), method: collection.method, paymentType: "CREDIT" });
  }
  for (const payment of legacyPaid) {
    entries.push({
      amount: payment.amount,
      method: payment.paymentMethod ?? "OTHER",
      paymentType: payment.paymentType,
      classId: payment.classId ? String(payment.classId) : undefined
    });
  }
  return { entries, refunded: toPesos(refunds.reduce((sum, item) => sum + item.amountCents, 0)) };
}

export const adminReportsRouter = Router();

adminReportsRouter.get("/overview", async (request, response, next) => {
  try {
    const query = reportQuerySchema.parse(request.query);
    response.json(await buildOverview(request.auth!.organizationId, query));
  } catch (error) {
    next(error);
  }
});

adminReportsRouter.get("/export.xlsx", async (request, response, next) => {
  try {
    const query = reportQuerySchema.parse(request.query);
    const overview = await buildOverview(request.auth!.organizationId, query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "M&M Academia";
    workbook.created = new Date();

    const summary = workbook.addWorksheet("Resumen");
    summary.columns = [
      { header: "Indicador", key: "label", width: 35 },
      { header: "Valor", key: "value", width: 22 },
      { header: "Criterio", key: "criterion", width: 58 }
    ];
    summary.addRows([
      { label: "Desde", value: dateForExcel(overview.range.from), criterion: "Rango seleccionado" },
      { label: "Hasta", value: dateForExcel(overview.range.to), criterion: "Rango seleccionado" },
      { label: "Cobrado en caja", value: overview.cash.collectedAmount, criterion: "Pagos con fecha de cobro dentro del rango" },
      { label: "Facturado vigente", value: overview.billing.issued.totalAmount, criterion: "Cargos por clase o mensualidades del rango; excluye anulados" },
      { label: "Pendiente", value: overview.billing.issued.pendingAmount, criterion: "Estado actual de cargos del rango" },
      { label: "Vencido", value: overview.billing.issued.overdueAmount, criterion: "Estado actual de cargos del rango" },
      { label: "Turnos registrados", value: overview.activity.sessions, criterion: "Ocurrencias creadas en Clase del día" },
      { label: "Asistencias presentes", value: overview.activity.attendance.present, criterion: "Registros de asistencia cargados" }
    ]);
    summary.getRow(1).font = { bold: true };
    summary.getColumn("value").numFmt = '#,##0.00';

    const finance = workbook.addWorksheet("Facturación y caja");
    finance.columns = [
      { header: "Modalidad", key: "type", width: 18 },
      { header: "Facturado vigente", key: "issued", width: 20 },
      { header: "Pagado del cargo", key: "settled", width: 20 },
      { header: "Pendiente", key: "pending", width: 18 },
      { header: "Vencido", key: "overdue", width: 18 },
      { header: "Cobrado en caja", key: "cash", width: 20 },
      { header: "Cobros", key: "cashCount", width: 12 }
    ];
    for (const type of overview.billing.byPaymentType) {
      const cash = overview.cash.byPaymentType.find((item) => item.paymentType === type.paymentType);
      finance.addRow({
        type: type.paymentType === "PER_CLASS" ? "Por clase" : "Mensual",
        issued: type.totalAmount,
        settled: type.collectedAmount,
        pending: type.pendingAmount,
        overdue: type.overdueAmount,
        cash: cash?.amount ?? 0,
        cashCount: cash?.count ?? 0
      });
    }
    finance.getRow(1).font = { bold: true };
    ["issued", "settled", "pending", "overdue", "cash"].forEach((key) => {
      finance.getColumn(key).numFmt = '"$" #,##0.00';
    });

    const classes = workbook.addWorksheet("Actividad por clase");
    classes.columns = [
      { header: "Clase", key: "name", width: 30 },
      { header: "Modalidad", key: "billingMode", width: 16 },
      { header: "Turnos", key: "sessions", width: 12 },
      { header: "Completados", key: "completed", width: 14 },
      { header: "Cancelados", key: "cancelled", width: 14 },
      { header: "Presentes", key: "present", width: 12 },
      { header: "Ausentes", key: "absent", width: 12 },
      { header: "Facturado", key: "invoiced", width: 16 },
      { header: "Cobrado", key: "collected", width: 16 },
      { header: "Ocupación actual", key: "occupancy", width: 18 }
    ];
    for (const item of overview.classPerformance) {
      classes.addRow({
        name: item.name,
        billingMode: item.billingMode === "PER_CLASS" ? "Por clase" : item.billingMode === "MONTHLY" ? "Mensual" : item.billingMode === "BOTH" ? "Ambas" : "Sin cargo",
        sessions: item.sessions.total,
        completed: item.sessions.completed,
        cancelled: item.sessions.cancelled,
        present: item.attendance.present,
        absent: item.attendance.absent,
        invoiced: item.invoiced.amount,
        collected: item.collected.amount,
        occupancy: item.capacity ? item.occupancy.percent / 100 : undefined
      });
    }
    classes.getRow(1).font = { bold: true };
    classes.getColumn("invoiced").numFmt = '"$" #,##0.00';
    classes.getColumn("collected").numFmt = '"$" #,##0.00';
    classes.getColumn("occupancy").numFmt = "0%";

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="reporte-${overview.range.from}_a_${overview.range.to}.xlsx"`
    );

    await workbook.xlsx.write(response);
    response.end();
  } catch (error) {
    next(error);
  }
});
