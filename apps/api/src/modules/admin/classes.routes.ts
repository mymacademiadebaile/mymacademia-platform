import { BILLING_MODES, WEEK_DAYS } from "@mym/shared";
import { containsText } from "../../common/regex";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { enrollmentReconciliation } from "../enrollments/billing-preference";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { TrialBookingModel } from "../trials/trial-booking.model";
import { objectIdSchema } from "./admin.schemas";

const scheduleSchema = z.object({
  day: z.enum(WEEK_DAYS),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
}).refine((schedule) => schedule.startTime < schedule.endTime, {
  message: "La hora de fin debe ser posterior a la hora de inicio",
  path: ["endTime"]
});

const classBodySchema = z.object({
  branchId: objectIdSchema,
  name: z.string().trim().min(2).max(120),
  professorIds: z.array(objectIdSchema).min(1),
  disciplineIds: z.array(objectIdSchema).min(1),
  segmentIds: z.array(objectIdSchema).min(1),
  levelIds: z.array(objectIdSchema).min(1),
  capacity: z.number().int().min(1).max(500),
  billingMode: z.enum(BILLING_MODES).default("PER_CLASS"),
  pricePerClass: z.number().min(0).max(100000000).default(0),
  monthlyPrice: z.number().min(0).max(100000000).default(0),
  freeTrialEnabled: z.boolean().default(false),
  schedules: z.array(scheduleSchema).min(1).max(14)
}).superRefine((value, context) => {
  const keys = new Set<string>();

  value.schedules.forEach((schedule, index) => {
    const key = `${schedule.day}:${schedule.startTime}:${schedule.endTime}`;
    if (keys.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["schedules", index],
        message: "El horario está repetido"
      });
    }
    keys.add(key);
  });
});

const updateDanceClassSchema = z.object({
  branchId: objectIdSchema.optional(),
  name: z.string().trim().min(2).max(120).optional(),
  professorIds: z.array(objectIdSchema).min(1).optional(),
  disciplineIds: z.array(objectIdSchema).min(1).optional(),
  segmentIds: z.array(objectIdSchema).min(1).optional(),
  levelIds: z.array(objectIdSchema).min(1).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  billingMode: z.enum(BILLING_MODES).optional(),
  pricePerClass: z.number().min(0).max(100000000).optional(),
  monthlyPrice: z.number().min(0).max(100000000).optional(),
  freeTrialEnabled: z.boolean().optional(),
  schedules: z.array(scheduleSchema).min(1).max(14).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  publishOnWeb: z.boolean().optional()
}).superRefine((value, context) => {
  if (!value.schedules) return;

  const keys = new Set<string>();

  value.schedules.forEach((schedule, index) => {
    const key = `${schedule.day}:${schedule.startTime}:${schedule.endTime}`;
    if (keys.has(key)) {
      context.addIssue({
        code: "custom",
        path: ["schedules", index],
        message: "El horario está repetido"
      });
    }
    keys.add(key);
  });
});

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  branchId: objectIdSchema.optional(),
  professorId: objectIdSchema.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

type ScheduleInput = z.infer<typeof scheduleSchema>;

function overlaps(a: ScheduleInput, b: { day: string; startTime: string; endTime: string }) {
  return a.day === b.day && a.startTime < b.endTime && b.startTime < a.endTime;
}

async function validateClassRelations(
  organizationId: string,
  input: {
    branchId: string;
    professorIds: string[];
    disciplineIds: string[];
    segmentIds: string[];
    levelIds: string[];
  }
) {
  const [branch, professors, disciplineCount, segmentCount, levelCount] = await Promise.all([
    BranchModel.findOne({
      _id: input.branchId,
      organizationId,
      isActive: true
    }),
    ProfessorModel.find({
      _id: { $in: input.professorIds },
      organizationId,
      isActive: true
    }).select("_id userId"),
    CatalogItemModel.countDocuments({
      _id: { $in: input.disciplineIds },
      organizationId,
      type: "DISCIPLINE",
      isActive: true
    }),
    CatalogItemModel.countDocuments({
      _id: { $in: input.segmentIds },
      organizationId,
      type: "SEGMENT",
      isActive: true
    }),
    CatalogItemModel.countDocuments({
      _id: { $in: input.levelIds },
      organizationId,
      type: "LEVEL",
      isActive: true
    })
  ]);

  if (!branch) {
    throw new AppError(422, "La sede seleccionada no es válida", "INVALID_BRANCH");
  }

  if (professors.length !== input.professorIds.length) {
    throw new AppError(422, "Uno o más profesores no son válidos", "INVALID_PROFESSORS");
  }

  const professorUsers = await UserModel.countDocuments({
    _id: { $in: professors.map((professor) => professor.userId) },
    organizationId,
    role: "PROFESSOR",
    isActive: true,
    branchIds: new Types.ObjectId(input.branchId)
  });

  if (professorUsers !== professors.length) {
    throw new AppError(
      422,
      "Todos los profesores deben estar habilitados para la sede seleccionada",
      "PROFESSOR_BRANCH_MISMATCH"
    );
  }

  if (disciplineCount !== input.disciplineIds.length) {
    throw new AppError(422, "Una o más disciplinas no son válidas", "INVALID_DISCIPLINES");
  }

  if (segmentCount !== input.segmentIds.length) {
    throw new AppError(422, "Uno o más públicos no son válidos", "INVALID_SEGMENTS");
  }

  if (levelCount !== input.levelIds.length) {
    throw new AppError(422, "Uno o más niveles no son válidos", "INVALID_LEVELS");
  }
}

async function ensureNoProfessorConflicts(
  organizationId: string,
  professorIds: string[],
  schedules: ScheduleInput[],
  excludeClassId?: string
) {
  const filter: Record<string, unknown> = {
    organizationId,
    status: "ACTIVE",
    professorIds: { $in: professorIds }
  };

  if (excludeClassId) {
    filter._id = { $ne: excludeClassId };
  }

  const existing = await DanceClassModel.find(filter).select(
    "name professorIds schedules"
  );

  for (const danceClass of existing) {
    const sharedProfessor = danceClass.professorIds.some((professorId) =>
      professorIds.includes(professorId.toString())
    );

    if (!sharedProfessor) continue;

    const hasConflict = schedules.some((candidate) =>
      danceClass.schedules.some((current) => overlaps(candidate, current))
    );

    if (hasConflict) {
      throw new AppError(
        409,
        `Hay un conflicto de horario con la clase "${danceClass.name}"`,
        "PROFESSOR_SCHEDULE_CONFLICT"
      );
    }
  }
}

export const adminClassesRouter = Router();

function populateClassQuery<T extends { populate: (...args: any[]) => T }>(query: T): T {
  return query
    .populate("professorIds", "displayName avatarUrl isActive disciplineIds")
    .populate("disciplineIds segmentIds levelIds", "name type isActive sortOrder") as T;
}

adminClassesRouter.get("/", async (request, response, next) => {
  try {
    const query = listQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };

    if (query.q) filter.name = containsText(query.q);
    if (query.branchId) filter.branchId = query.branchId;
    if (query.professorId) filter.professorIds = query.professorId;
    if (query.status) filter.status = query.status;

    const items = await DanceClassModel.find(filter)
      .populate("professorIds", "displayName avatarUrl isActive disciplineIds")
      .populate("disciplineIds segmentIds levelIds", "name type isActive sortOrder")
      .sort({ status: 1, name: 1 });

    const counts = items.length
      ? await EnrollmentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              organizationId: new Types.ObjectId(organizationId),
              classId: { $in: items.map((item) => item._id) },
              status: "ACTIVE"
            }
          },
          { $group: { _id: "$classId", count: { $sum: 1 } } }
        ])
      : [];

    const countMap = new Map(counts.map((item) => [item._id.toString(), item.count]));

    response.json(
      items.map((item) => ({
        ...item.toObject(),
        activeEnrollmentCount: countMap.get(item.id) ?? 0
      }))
    );
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.get("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const item = await DanceClassModel.findOne({
      _id: id,
      organizationId
    })
      .populate("professorIds", "displayName avatarUrl isActive disciplineIds")
      .populate("disciplineIds segmentIds levelIds", "name type isActive sortOrder");

    if (!item) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    const activeEnrollmentCount = await EnrollmentModel.countDocuments({
      organizationId,
      classId: item._id,
      status: "ACTIVE"
    });

    response.json({
      ...item.toObject(),
      activeEnrollmentCount
    });
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.post("/", async (request, response, next) => {
  try {
    const input = classBodySchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    await validateClassRelations(organizationId, input);
    await ensureNoProfessorConflicts(
      organizationId,
      input.professorIds,
      input.schedules
    );

    const item = await DanceClassModel.create({
      organizationId,
      ...input,
      status: "ACTIVE"
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CLASS_CREATED",
      entityType: "DanceClass",
      entityId: item._id,
      metadata: {
        name: item.name,
        branchId: item.branchId,
        professorIds: item.professorIds,
        schedules: item.schedules
      }
    });

    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateDanceClassSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const item = await DanceClassModel.findOne({
      _id: id,
      organizationId
    });

    if (!item) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    const merged = {
      branchId: input.branchId ?? item.branchId.toString(),
      professorIds: input.professorIds ?? item.professorIds.map((value) => value.toString()),
      disciplineIds: input.disciplineIds ?? item.disciplineIds.map((value) => value.toString()),
      segmentIds: input.segmentIds ?? item.segmentIds.map((value) => value.toString()),
      levelIds: input.levelIds ?? item.levelIds.map((value) => value.toString())
    };

    if (
      input.branchId ||
      input.professorIds ||
      input.disciplineIds ||
      input.segmentIds ||
      input.levelIds
    ) {
      await validateClassRelations(organizationId, merged);
    }

    const targetStatus = input.status ?? item.status;
    const schedules = input.schedules ?? item.schedules;

    if (targetStatus === "ACTIVE" && (input.professorIds || input.schedules || item.status !== "ACTIVE")) {
      await ensureNoProfessorConflicts(
        organizationId,
        merged.professorIds,
        schedules,
        item.id
      );
    }

    const before = {
      branchId: item.branchId.toString(),
      name: item.name,
      professorIds: item.professorIds.map((value) => value.toString()),
      disciplineIds: item.disciplineIds.map((value) => value.toString()),
      segmentIds: item.segmentIds.map((value) => value.toString()),
      levelIds: item.levelIds.map((value) => value.toString()),
      capacity: item.capacity,
      billingMode: item.billingMode ?? "MONTHLY",
      pricePerClass: item.pricePerClass ?? 0,
      monthlyPrice: item.monthlyPrice ?? 0,
      freeTrialEnabled: item.freeTrialEnabled ?? false,
      schedules: item.schedules,
      status: item.status,
      publishOnWeb: item.publishOnWeb ?? true
    };

    if (input.branchId !== undefined) item.branchId = new Types.ObjectId(input.branchId);
    if (input.name !== undefined) item.name = input.name;
    if (input.professorIds !== undefined) item.professorIds = input.professorIds.map((value) => new Types.ObjectId(value));
    if (input.disciplineIds !== undefined) item.disciplineIds = input.disciplineIds.map((value) => new Types.ObjectId(value));
    if (input.segmentIds !== undefined) item.segmentIds = input.segmentIds.map((value) => new Types.ObjectId(value));
    if (input.levelIds !== undefined) item.levelIds = input.levelIds.map((value) => new Types.ObjectId(value));
    if (input.capacity !== undefined) {
      const activeEnrollmentCount = await EnrollmentModel.countDocuments({
        organizationId,
        classId: item._id,
        status: "ACTIVE"
      });

      if (input.capacity < activeEnrollmentCount) {
        throw new AppError(
          409,
          `El cupo no puede ser menor a los ${activeEnrollmentCount} alumnos inscriptos`,
          "CAPACITY_BELOW_ENROLLMENTS"
        );
      }

      item.capacity = input.capacity;
    }
    const billingModeChanged =
      input.billingMode !== undefined && input.billingMode !== item.billingMode;
    if (input.billingMode !== undefined) item.billingMode = input.billingMode;
    if (input.pricePerClass !== undefined) item.pricePerClass = input.pricePerClass;
    if (input.monthlyPrice !== undefined) item.monthlyPrice = input.monthlyPrice;
    if (input.freeTrialEnabled !== undefined) item.freeTrialEnabled = input.freeTrialEnabled;
    if (input.schedules !== undefined) item.schedules = input.schedules;
    if (input.status !== undefined) item.status = input.status;
    if (input.publishOnWeb !== undefined) item.publishOnWeb = input.publishOnWeb;

    await item.save();

    // The class is saved first; there are no transactions here, so a failure in the next write
    // would leave ACTIVE enrollments with the old preferences until the mode is changed again.
    let enrollmentsReconciled: number | undefined;
    if (billingModeChanged) {
      const { filter, update } = enrollmentReconciliation(item.billingMode);
      const result = await EnrollmentModel.updateMany(
        { ...filter, organizationId, classId: item._id, status: "ACTIVE" },
        update
      );
      enrollmentsReconciled = result.modifiedCount;
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CLASS_UPDATED",
      entityType: "DanceClass",
      entityId: item._id,
      metadata: {
        before,
        after: {
          branchId: item.branchId.toString(),
          name: item.name,
          professorIds: item.professorIds.map((value) => value.toString()),
          disciplineIds: item.disciplineIds.map((value) => value.toString()),
          segmentIds: item.segmentIds.map((value) => value.toString()),
          levelIds: item.levelIds.map((value) => value.toString()),
          capacity: item.capacity,
          billingMode: item.billingMode ?? "MONTHLY",
          pricePerClass: item.pricePerClass ?? 0,
          monthlyPrice: item.monthlyPrice ?? 0,
          freeTrialEnabled: item.freeTrialEnabled ?? false,
          schedules: item.schedules,
          status: item.status,
          publishOnWeb: item.publishOnWeb ?? true
        },
        ...(enrollmentsReconciled !== undefined ? { enrollmentsReconciled } : {})
      }
    });

    response.json(item);
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const item = await DanceClassModel.findOne({ _id: id, organizationId });

    if (!item) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    // A class can be safely removed only before it has generated academic or
    // financial history. Keeping these records prevents broken references and
    // preserves the academy's audit trail.
    const [enrollmentCount, paymentCount, sessionCount, trialCount] = await Promise.all([
      EnrollmentModel.countDocuments({ organizationId, classId: item._id }),
      PaymentModel.countDocuments({ organizationId, classId: item._id }),
      ClassSessionModel.countDocuments({ organizationId, classId: item._id }),
      TrialBookingModel.countDocuments({ organizationId, classId: item._id })
    ]);

    const dependencies = [
      [enrollmentCount, "inscripción"],
      [paymentCount, "pago"],
      [sessionCount, "sesión"],
      [trialCount, "prueba"]
    ] as const;
    const history = dependencies
      .filter(([count]) => count > 0)
      .map(([count, label]) => `${count} ${label}${count === 1 ? "" : "s"}`);

    if (history.length > 0) {
      throw new AppError(
        409,
        `No se puede eliminar la clase porque tiene historial asociado: ${history.join(", ")}. Podés inactivarla para conservar ese historial.`,
        "CLASS_HAS_HISTORY"
      );
    }

    await item.deleteOne();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CLASS_DELETED",
      entityType: "DanceClass",
      entityId: item._id,
      metadata: {
        name: item.name,
        branchId: item.branchId,
        status: item.status
      }
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
