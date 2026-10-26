import { createHash } from "node:crypto";
import { withRequiredTransaction } from "../../common/required-transaction";
import { ContactModel } from "../contacts/contact.model";
import { resolveContact } from "../contacts/contact-service";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { Router } from "express";
import { containsText } from "../../common/regex";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { BranchModel } from "../core/branch.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { closeEnrollment } from "../enrollments/enrollment-service";
import { academyNow } from "../../common/dates";
import { chargeState, openCharges as listOpenCharges, studentBalances, studentIdsWithOverdueDebt } from "../billing/balance-service";
import { CollectionModel } from "../billing/collection.model";
import { toPesos } from "../../common/money";
import { StudentModel } from "../students/student.model";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";
import { optionalDniSchema } from "../../common/dni";
import { assertDniAvailable, dniLockKey } from "../contacts/dni-service";

const studentSchema = z.object({
  branchId: objectIdSchema,
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  dni: optionalDniSchema,
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

function intersectIds(lists: unknown[][]) {
  const [first, ...rest] = lists.map((list) => list.map(String));
  const kept = first.filter((id) => rest.every((list) => list.includes(id)));
  return kept.map((id) => new Types.ObjectId(id));
}

export const adminStudentsRouter = Router();

adminStudentsRouter.get("/", async (request, response, next) => {
  try {
    const query = listStudentQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };

    if (query.q) {
      // Every word may match a different identity field, so full names work too.
      filter.$and = query.q.split(/\s+/).map((term) => {
        const matches: Array<Record<string, unknown>> = ["firstName", "lastName", "email", "phone", "dni"]
          .map((field) => ({ [field]: containsText(term) }));
        const digits = term.replace(/\D/g, "");
        if (digits.length >= 2 && digits !== term) {
          matches.push({ phone: containsText(digits) }, { dni: containsText(digits) });
        }
        return { $or: matches };
      });
    }

    if (query.branchId) {
      filter.branchId = query.branchId;
    }

    if (query.isActive) {
      filter.isActive = query.isActive === "true";
    }

    // Every id restriction is intersected: "debtors of class X" must not widen to every debtor.
    const idRestrictions: unknown[][] = [];

    if (query.classId) {
      idRestrictions.push(
        await EnrollmentModel.distinct("studentId", {
          organizationId,
          classId: query.classId,
          status: "ACTIVE"
        })
      );
    }

    if (query.debt === "true") {
      idRestrictions.push(await studentIdsWithOverdueDebt(organizationId));
    }

    if (idRestrictions.length) {
      filter._id = { $in: intersectIds(idRestrictions) };
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

    const [enrollments, balances, collections, openCharges] = await Promise.all([
      EnrollmentModel.find({
        organizationId,
        studentId: student._id
      })
        .populate({
          path: "classId",
          select: "name schedules capacity status billingMode pricePerClass monthlyPrice monthlyPrice4 monthlyPrice8 professorIds disciplineIds segmentIds levelIds",
          populate: [
            { path: "professorIds", select: "displayName" },
            { path: "disciplineIds", select: "name type" },
            { path: "segmentIds", select: "name type" },
            { path: "levelIds", select: "name type" }
          ]
        })
        .sort({ enrolledAt: -1 }),
      studentBalances(organizationId, [student._id]),
      CollectionModel.find({ organizationId, studentId: student._id, voidedAt: null }).select("amountCents refundedCents").lean<any[]>(),
      listOpenCharges(organizationId, { studentIds: [student._id] })
    ]);
    const balance = balances.get(String(student._id))!;
    const today = academyNow().date;
    let overdueCount = 0;
    let pendingCount = 0;
    for (const charge of openCharges) {
      const state = chargeState(charge, today);
      if (state.status === "PAID" || state.status === "VOID") continue;
      if (state.overdue) overdueCount += 1;
      else pendingCount += 1;
    }
    const collected = collections.reduce(
      (sum, item) => ({ amountCents: sum.amountCents + item.amountCents, refundedCents: sum.refundedCents + item.refundedCents, count: sum.count + 1 }),
      { amountCents: 0, refundedCents: 0, count: 0 }
    );

    response.json({
      student,
      enrollments,
      // Everything derives from charges and collections (central balance, same rule as every screen).
      financial: {
        paidAmount: toPesos(collected.amountCents - collected.refundedCents),
        paidCount: collected.count,
        pendingAmount: toPesos(balance.pendingCents - balance.overdueCents),
        overdueAmount: toPesos(balance.overdueCents),
        creditAmount: toPesos(balance.creditCents),
        pendingCount,
        overdueCount,
        openCount: balance.openCount,
        partialCount: balance.partialCount
      }
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

    const keys = [normalizedEmail ? `identity:email:${createHash("sha256").update(normalizedEmail).digest("hex")}` : `student-create:${new Types.ObjectId()}`];
    if (input.dni) keys.push(dniLockKey(input.dni));
    await ensureLocks(organizationId, keys);
    const result = await withRequiredTransaction(async (dbSession) => {
      await touchLocks(organizationId, keys, dbSession);
      await assertDniAvailable(organizationId, input.dni, undefined, dbSession);
      if (normalizedEmail && await ContactModel.exists({ organizationId, email: normalizedEmail }).session(dbSession)) {
        throw new AppError(409, "Ya existe un contacto con ese email; reutilizá su identidad desde Contactos", "CONTACT_MATCH_REQUIRES_REVIEW");
      }
      if (normalizedEmail) {
        const duplicate = await StudentModel.exists({
          organizationId,
          email: normalizedEmail,
          isActive: true
        }).session(dbSession);

        if (duplicate) {
          throw new AppError(
            409,
            "Ya existe un alumno activo con ese email",
            "STUDENT_EMAIL_ALREADY_EXISTS"
          );
        }
      }

      const [student] = await StudentModel.create([{
        organizationId,
        ...input,
        email: normalizedEmail,
        phone: input.phone?.trim() || undefined,
        guardianName: input.guardianName?.trim() || undefined,
        guardianPhone: input.guardianPhone?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        isActive: true
      }], { session: dbSession });
      const contact = await resolveContact(organizationId, String(student._id), dbSession);
      student.contactId = contact._id;
      await student.save({ session: dbSession });

      await AuditLogModel.create([{
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
      }], { session: dbSession });

      return student;
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

adminStudentsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateStudentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const keys = [`contact:${id}`, ...(input.dni ? [dniLockKey(input.dni)] : [])]; await ensureLocks(organizationId, keys);
    const result = await withRequiredTransaction(async (dbSession) => {
      await touchLocks(organizationId, keys, dbSession);
      const student = await StudentModel.findOne({
        _id: id,
        organizationId
      }).session(dbSession);

      if (!student) {
        throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
      }
      await assertDniAvailable(organizationId, input.dni, id, dbSession);

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
      if (Object.hasOwn(input, "dni")) student.dni = input.dni;
      if (input.birthDate !== undefined) student.birthDate = input.birthDate;
      if (input.guardianName !== undefined) student.guardianName = input.guardianName.trim() || undefined;
      if (input.guardianPhone !== undefined) student.guardianPhone = input.guardianPhone.trim() || undefined;
      if (input.notes !== undefined) student.notes = input.notes.trim() || undefined;
      if (input.isActive !== undefined) student.isActive = input.isActive;

      const deactivated = before.isActive && input.isActive === false;
      const contact = await resolveContact(organizationId, id, dbSession);
      student.contactId = contact._id;
      contact.set({ firstName: student.firstName, lastName: student.lastName, branchId: student.branchId,
        email: student.email, phone: student.phone, dni: student.dni, ...(input.isActive === true ? { isActive: true } : {}) });
      await contact.save({ session: dbSession });
      await student.save({ session: dbSession });

      // A student who leaves the academy stops taking seats. Enrollments close today; history,
      // attendance and pending debts stay (and can still be collected).
      let enrollmentsClosed = 0;
      if (deactivated) {
        const open = await EnrollmentModel.find({ organizationId, studentId: student._id, status: "ACTIVE" }).session(dbSession);
        for (const enrollment of open) {
          closeEnrollment(enrollment, academyNow().date, "Alumno dado de baja");
          await enrollment.save({ session: dbSession });
        }
        enrollmentsClosed = open.length;
      }

      await AuditLogModel.create([{
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
          },
          ...(deactivated ? { enrollmentsClosed } : {})
        }
      }], { session: dbSession });

      return student;
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});
