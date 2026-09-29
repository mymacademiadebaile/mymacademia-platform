import ExcelJS from "exceljs";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { ProfessorModel } from "../professors/professor.model";
import { StudentModel } from "../students/student.model";
import { objectIdSchema } from "./admin.schemas";

const reportQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  branchId: objectIdSchema.optional()
});

function currentPeriod() {
  const argentinaNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return argentinaNow.toISOString().slice(0, 7);
}

function periodBounds(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 3, 0, 0));
  return { start, end };
}

function effectivePaymentStatus(payment: { status: string; dueDate: Date }) {
  if (payment.status === "PENDING" && payment.dueDate.getTime() < Date.now()) {
    return "OVERDUE";
  }
  return payment.status;
}

async function buildOverview(
  organizationId: string,
  period: string,
  branchId?: string
) {
  const { start, end } = periodBounds(period);
  const commonFilter: Record<string, unknown> = { organizationId };
  if (branchId) commonFilter.branchId = branchId;

  const classFilter: Record<string, unknown> = {
    organizationId,
    status: "ACTIVE"
  };
  if (branchId) classFilter.branchId = branchId;

  const studentFilter: Record<string, unknown> = {
    organizationId,
    isActive: true
  };
  if (branchId) studentFilter.branchId = branchId;

  const paymentFilter: Record<string, unknown> = {
    organizationId,
    period
  };
  if (branchId) paymentFilter.branchId = branchId;

  const [students, newStudents, professors, classes, payments] = await Promise.all([
    StudentModel.countDocuments(studentFilter),
    StudentModel.countDocuments({
      ...studentFilter,
      createdAt: { $gte: start, $lt: end }
    }),
    ProfessorModel.countDocuments({ organizationId, isActive: true }),
    DanceClassModel.find(classFilter)
      .select("name branchId capacity professorIds disciplineIds schedules")
      .populate("disciplineIds", "name")
      .sort({ name: 1 }),
    PaymentModel.find(paymentFilter).select("amount status dueDate")
  ]);

  const classIds = classes.map((item) => item._id);
  const enrollmentGroups = classIds.length
    ? await EnrollmentModel.aggregate([
        {
          $match: {
            organizationId: new Types.ObjectId(organizationId),
            classId: { $in: classIds },
            status: "ACTIVE"
          }
        },
        {
          $group: {
            _id: "$classId",
            occupied: { $sum: 1 }
          }
        }
      ])
    : [];

  const occupiedByClass = new Map(
    enrollmentGroups.map((item) => [String(item._id), item.occupied as number])
  );

  const occupancy = classes.map((danceClass) => {
    const occupied = occupiedByClass.get(String(danceClass._id)) ?? 0;
    return {
      id: danceClass.id,
      name: danceClass.name,
      capacity: danceClass.capacity,
      occupied,
      available: Math.max(0, danceClass.capacity - occupied),
      occupancyPercent: danceClass.capacity
        ? Math.round((occupied / danceClass.capacity) * 100)
        : 0,
      disciplines: (danceClass.disciplineIds as unknown as Array<{ name: string }>).map(
        (item) => item.name
      )
    };
  }).sort((a, b) => b.occupancyPercent - a.occupancyPercent);

  const financial = payments.reduce(
    (acc, payment) => {
      const status = effectivePaymentStatus(payment);
      acc.totalAmount += payment.amount;
      acc.count += 1;

      if (status === "PAID") {
        acc.collectedAmount += payment.amount;
        acc.paidCount += 1;
      } else if (status === "OVERDUE") {
        acc.overdueAmount += payment.amount;
        acc.overdueCount += 1;
      } else if (status === "PENDING") {
        acc.pendingAmount += payment.amount;
        acc.pendingCount += 1;
      } else if (status === "CANCELLED") {
        acc.cancelledAmount += payment.amount;
        acc.cancelledCount += 1;
      }

      return acc;
    },
    {
      totalAmount: 0,
      collectedAmount: 0,
      pendingAmount: 0,
      overdueAmount: 0,
      cancelledAmount: 0,
      count: 0,
      paidCount: 0,
      pendingCount: 0,
      overdueCount: 0,
      cancelledCount: 0
    }
  );

  return {
    period,
    students: {
      active: students,
      newInPeriod: newStudents
    },
    professors: {
      active: professors
    },
    classes: {
      active: classes.length,
      totalCapacity: occupancy.reduce((sum, item) => sum + item.capacity, 0),
      occupied: occupancy.reduce((sum, item) => sum + item.occupied, 0)
    },
    financial,
    occupancy
  };
}

export const adminReportsRouter = Router();

adminReportsRouter.get("/overview", async (request, response, next) => {
  try {
    const query = reportQuerySchema.parse(request.query);
    const overview = await buildOverview(
      request.auth!.organizationId,
      query.period ?? currentPeriod(),
      query.branchId
    );

    response.json(overview);
  } catch (error) {
    next(error);
  }
});

adminReportsRouter.get("/export.xlsx", async (request, response, next) => {
  try {
    const query = reportQuerySchema.parse(request.query);
    const period = query.period ?? currentPeriod();
    const overview = await buildOverview(
      request.auth!.organizationId,
      period,
      query.branchId
    );

    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet("Resumen");
    summary.columns = [
      { header: "Indicador", key: "label", width: 30 },
      { header: "Valor", key: "value", width: 20 }
    ];

    summary.addRows([
      { label: "Período", value: period },
      { label: "Alumnos activos", value: overview.students.active },
      { label: "Altas del período", value: overview.students.newInPeriod },
      { label: "Profesores activos", value: overview.professors.active },
      { label: "Clases activas", value: overview.classes.active },
      { label: "Cupo total", value: overview.classes.totalCapacity },
      { label: "Lugares ocupados", value: overview.classes.occupied },
      { label: "Cobrado", value: overview.financial.collectedAmount },
      { label: "Pendiente", value: overview.financial.pendingAmount },
      { label: "Vencido", value: overview.financial.overdueAmount }
    ]);
    summary.getRow(1).font = { bold: true };

    const occupancySheet = workbook.addWorksheet("Ocupación");
    occupancySheet.columns = [
      { header: "Clase", key: "name", width: 30 },
      { header: "Disciplinas", key: "disciplines", width: 30 },
      { header: "Cupo", key: "capacity", width: 12 },
      { header: "Inscriptos", key: "occupied", width: 12 },
      { header: "Disponibles", key: "available", width: 12 },
      { header: "Ocupación %", key: "percent", width: 14 }
    ];

    for (const item of overview.occupancy) {
      occupancySheet.addRow({
        name: item.name,
        disciplines: item.disciplines.join(", "),
        capacity: item.capacity,
        occupied: item.occupied,
        available: item.available,
        percent: item.occupancyPercent / 100
      });
    }

    occupancySheet.getRow(1).font = { bold: true };
    occupancySheet.getColumn("percent").numFmt = "0%";

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="reporte-${period}.xlsx"`
    );

    await workbook.xlsx.write(response);
    response.end();
  } catch (error) {
    next(error);
  }
});
