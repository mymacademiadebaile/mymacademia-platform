import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { BranchModel } from "../core/branch.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { StudentModel } from "../students/student.model";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";

const studentSchema = z.object({
  branchId: objectIdSchema,
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  birthDate: z.coerce.date().optional(),
  guardianName: z.string().trim().max(120).optional().or(z.literal("")),
  guardianPhone: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
});

const updateStudentSchema = studentSchema.partial().extend({
  isActive: z.boolean().optional()
});

const listStudentQuerySchema = pageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  branchId: objectIdSchema.optional(),
  classId: objectIdSchema.optional(),
  isActive: z.enum(["true", "false"]).optional(),
  debt: z.enum(["true", "false"]).optional()
});

// Same answer for a missing, foreign or inactive branch so callers cannot probe other organizations.
async function assertAssignableBranch(organizationId: string, branchId: string) {
  const branch = await BranchModel.exists({ _id: branchId, organizationId, isActive: true });

  if (!branch) {
    throw new AppError(
      422,
      "La sede seleccionada no es válida o no está activa",
      "INVALID_BRANCH"
    );
  }
}

export const adminStudentsRouter = Router();

adminStudentsRouter.get("/", async (request, response, next) => {
  try {
    const query = listStudentQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };

    if (query.q) {
      filter.$or = [
        { firstName: { $regex: query.q, $options: "i" } },
        { lastName: { $regex: query.q, $options: "i" } },
        { email: { $regex: query.q, $options: "i" } },
        { phone: { $regex: query.q, $options: "i" } }
      ];
    }

    if (query.branchId) {
      filter.branchId = query.branchId;
    }

    if (query.isActive) {
      filter.isActive = query.isActive === "true";
    }

    if (query.classId) {
      const enrolledStudentIds = await EnrollmentModel.distinct("studentId", {
        organizationId,
        classId: query.classId,
        status: "ACTIVE"
      });

      filter._id = { $in: enrolledStudentIds };
    }

    if (query.debt === "true") {
      const studentIdsWithDebt = await PaymentModel.distinct("studentId", {
        organizationId,
        $or: [
          { status: "OVERDUE" },
          { status: "PENDING", dueDate: { $lt: new Date() } }
        ]
      });

      filter._id = { $in: studentIdsWithDebt };
    }

    const [items, total] = await Promise.all([
      StudentModel.find(filter)
        .sort({ lastName: 1, firstName: 1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      StudentModel.countDocuments(filter)
    ]);

    response.json({ items, total, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

adminStudentsRouter.get("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const student = await StudentModel.findOne({
      _id: id,
      organizationId
    });

    if (!student) {
      throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
    }

    const [enrollments, payments] = await Promise.all([
      EnrollmentModel.find({
        organizationId,
        studentId: student._id
      })
        .populate({
          path: "classId",
          select: "name schedules capacity status professorIds disciplineIds segmentIds levelIds",
          populate: [
            { path: "professorIds", select: "displayName" },
            { path: "disciplineIds", select: "name type" },
            { path: "segmentIds", select: "name type" },
            { path: "levelIds", select: "name type" }
          ]
        })
        .sort({ enrolledAt: -1 }),
      PaymentModel.find({
        organizationId,
        studentId: student._id
      }).sort({ dueDate: -1 })
    ]);

    const now = new Date();
    const financial = payments.reduce(
      (summary, payment) => {
        if (payment.status === "PAID") {
          summary.paidAmount += payment.amount;
          summary.paidCount += 1;
        } else if (
          payment.status === "OVERDUE" ||
          (payment.status === "PENDING" && payment.dueDate < now)
        ) {
          summary.overdueAmount += payment.amount;
          summary.overdueCount += 1;
        } else if (payment.status === "PENDING") {
          summary.pendingAmount += payment.amount;
          summary.pendingCount += 1;
        }

        return summary;
      },
      {
        paidAmount: 0,
        paidCount: 0,
        pendingAmount: 0,
        pendingCount: 0,
        overdueAmount: 0,
        overdueCount: 0
      }
    );

    response.json({
      student,
      enrollments,
      payments,
      financial
    });
  } catch (error) {
    next(error);
  }
});

adminStudentsRouter.post("/", async (request, response, next) => {
  try {
    const input = studentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const normalizedEmail = input.email?.trim().toLowerCase() || undefined;

    await assertAssignableBranch(organizationId, input.branchId);

    if (normalizedEmail) {
      const duplicate = await StudentModel.exists({
        organizationId,
        email: normalizedEmail,
        isActive: true
      });

      if (duplicate) {
        throw new AppError(
          409,
          "Ya existe un alumno activo con ese email",
          "STUDENT_EMAIL_ALREADY_EXISTS"
        );
      }
    }

    const student = await StudentModel.create({
      organizationId,
      ...input,
      email: normalizedEmail,
      phone: input.phone?.trim() || undefined,
      guardianName: input.guardianName?.trim() || undefined,
      guardianPhone: input.guardianPhone?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      isActive: true
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "STUDENT_CREATED",
      entityType: "Student",
      entityId: student._id,
      metadata: {
        branchId: student.branchId,
        firstName: student.firstName,
        lastName: student.lastName
      }
    });

    response.status(201).json(student);
  } catch (error) {
    next(error);
  }
});

adminStudentsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateStudentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const student = await StudentModel.findOne({
      _id: id,
      organizationId
    });

    if (!student) {
      throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
    }

    // An unchanged (possibly inactive) branch is a historical reference and stays valid.
    if (input.branchId !== undefined && input.branchId !== student.branchId.toString()) {
      await assertAssignableBranch(organizationId, input.branchId);
    }

    const normalizedEmail =
      input.email === undefined ? undefined : input.email.trim().toLowerCase() || undefined;

    if (normalizedEmail && normalizedEmail !== student.email) {
      const duplicate = await StudentModel.exists({
        organizationId,
        email: normalizedEmail,
        isActive: true,
        _id: { $ne: student._id }
      });

      if (duplicate) {
        throw new AppError(
          409,
          "Ya existe un alumno activo con ese email",
          "STUDENT_EMAIL_ALREADY_EXISTS"
        );
      }
    }

    const before = {
      branchId: student.branchId.toString(),
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email ?? "",
      phone: student.phone ?? "",
      birthDate: student.birthDate?.toISOString() ?? "",
      guardianName: student.guardianName ?? "",
      guardianPhone: student.guardianPhone ?? "",
      notes: student.notes ?? "",
      isActive: student.isActive
    };

    if (input.branchId !== undefined) student.branchId = new Types.ObjectId(input.branchId);
    if (input.firstName !== undefined) student.firstName = input.firstName;
    if (input.lastName !== undefined) student.lastName = input.lastName;
    if (input.email !== undefined) student.email = normalizedEmail;
    if (input.phone !== undefined) student.phone = input.phone.trim() || undefined;
    if (input.birthDate !== undefined) student.birthDate = input.birthDate;
    if (input.guardianName !== undefined) student.guardianName = input.guardianName.trim() || undefined;
    if (input.guardianPhone !== undefined) student.guardianPhone = input.guardianPhone.trim() || undefined;
    if (input.notes !== undefined) student.notes = input.notes.trim() || undefined;
    if (input.isActive !== undefined) student.isActive = input.isActive;

    await student.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "STUDENT_UPDATED",
      entityType: "Student",
      entityId: student._id,
      metadata: {
        before,
        after: {
          branchId: student.branchId.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email ?? "",
          phone: student.phone ?? "",
          birthDate: student.birthDate?.toISOString() ?? "",
          guardianName: student.guardianName ?? "",
          guardianPhone: student.guardianPhone ?? "",
          notes: student.notes ?? "",
          isActive: student.isActive
        }
      }
    });

    response.json(student);
  } catch (error) {
    next(error);
  }
});
