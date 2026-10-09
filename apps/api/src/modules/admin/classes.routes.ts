import { BILLING_MODES, WEEK_DAYS } from "@mym/shared";
import { containsText } from "../../common/regex";
import { Router } from "express";
import { Types, type HydratedDocument } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { ChargeModel } from "../billing/charge.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel, type DanceClass } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { enrollmentReconciliation } from "../enrollments/billing-preference";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { SessionBookingModel } from "../sessions/session-booking.model";
import { ClassScheduleModel } from "../scheduling/class-schedule.model";
import { TrialBookingModel } from "../trials/trial-booking.model";
import { academyNow } from "../../common/dates";
import { isArchivedStatus } from "../classes/class.model";
import {
  applyWeeklySchedules,
  archiveGroup,
  createScheduleSeries,
  pauseGroup,
  resumeGroup
} from "../scheduling/schedule-commands";
import { ensureScheduleRules, loadRules, ruleCoversDate, slotKey } from "../scheduling/schedule-service";
import { assertNoConflicts, assertUsableSpace, findRuleConflicts } from "../scheduling/conflict-service";
import { calendarDateSchema, objectIdSchema } from "./admin.schemas";

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
  monthlyPrice4: z.number().min(0).max(100000000).optional(),
  monthlyPrice8: z.number().min(0).max(100000000).optional(),
  freeTrialEnabled: z.boolean().default(false),
  schedules: z.array(scheduleSchema).min(1).max(14),
  /** First day of the recurring schedule (default today). */
  startDate: calendarDateSchema.optional(),
  /** Last day of the recurring schedule; absent means open-ended. */
  endDate: calendarDateSchema.optional(),
  defaultSpaceId: objectIdSchema.optional(),
  publishOnWeb: z.boolean().optional()
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "La fecha de fin debe ser posterior al inicio" });
  }
  if (["MONTHLY", "BOTH"].includes(value.billingMode)) {
    if (!value.monthlyPrice4 || value.monthlyPrice4 <= 0) {
      context.addIssue({ code: "custom", path: ["monthlyPrice4"], message: "Indicá el precio del plan mensual de 4 clases" });
    }
    if (!value.monthlyPrice8 || value.monthlyPrice8 <= 0) {
      context.addIssue({ code: "custom", path: ["monthlyPrice8"], message: "Indicá el precio del plan mensual de 8 clases" });
    }
  }
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

    const overlapsAnotherSlot = value.schedules.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.day === schedule.day &&
        other.startTime < schedule.endTime &&
        schedule.startTime < other.endTime
    );
    if (overlapsAnotherSlot) {
      context.addIssue({
        code: "custom",
        path: ["schedules", index],
        message: "Los horarios de la misma clase no pueden superponerse"
      });
    }
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
  monthlyPrice4: z.number().min(0).max(100000000).nullable().optional(),
  monthlyPrice8: z.number().min(0).max(100000000).nullable().optional(),
  freeTrialEnabled: z.boolean().optional(),
  schedules: z.array(scheduleSchema).min(1).max(14).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  publishOnWeb: z.boolean().optional(),
  defaultSpaceId: objectIdSchema.nullable().optional()
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
  status: z.enum(["ACTIVE", "INACTIVE", "PAUSED", "ARCHIVED"]).optional()
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

const actorOf = (request: Express.Request) => ({
  organizationId: request.auth!.organizationId,
  userId: request.auth!.userId
});

/** Active enrollments per current recurring slot (capacity is evaluated per slot). */
async function seriesOccupancy(organizationId: string, danceClass: any) {
  await ensureScheduleRules(organizationId, [danceClass]);
  const today = academyNow().date;
  const [rules, enrollments] = await Promise.all([
    loadRules(organizationId, { classIds: [danceClass._id], from: today }),
    EnrollmentModel.find({ organizationId, classId: danceClass._id, status: "ACTIVE" })
      .select("seriesIds scheduleKeys")
      .lean<any[]>()
  ]);
  const current = new Map<string, any>();
  for (const rule of rules) {
    if (ruleCoversDate(rule, today) || !current.has(String(rule.seriesId))) current.set(String(rule.seriesId), rule);
  }
  return [...current.values()].map((rule) => ({
    seriesId: String(rule.seriesId),
    day: rule.day,
    startTime: rule.startTime,
    endTime: rule.endTime,
    validFrom: rule.validFrom,
    validTo: rule.validTo,
    occupied: enrollments.filter((enrollment) =>
      enrollment.seriesIds?.length
        ? enrollment.seriesIds.some((id: unknown) => String(id) === String(rule.seriesId))
        : !enrollment.scheduleKeys?.length || enrollment.scheduleKeys.includes(slotKey(rule))
    ).length
  }));
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
    if (query.status) {
      filter.status = query.status === "INACTIVE" || query.status === "ARCHIVED" ? { $in: ["INACTIVE", "ARCHIVED"] } : query.status;
    }

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
      activeEnrollmentCount,
      scheduleOccupancy: await seriesOccupancy(organizationId, item.toObject())
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

    const { startDate, endDate, defaultSpaceId, monthlyPrice4, monthlyPrice8, ...fields } = input;
    const today = academyNow().date;
    const validFrom = startDate && startDate > today ? startDate : today;

    // Older groups are lazily migrated to rules.  Do that before checking a new
    // group so the validation sees both the professor and the physical pista.
    const activeGroups = await DanceClassModel.find({
      organizationId,
      status: "ACTIVE",
      "schedules.0": { $exists: true }
    })
      .select("_id organizationId branchId schedules createdAt")
      .lean<any[]>();
    await ensureScheduleRules(organizationId, activeGroups);

    if (defaultSpaceId) {
      await assertUsableSpace(organizationId, defaultSpaceId, new Types.ObjectId(input.branchId));
    }
    for (const slot of input.schedules) {
      assertNoConflicts(
        await findRuleConflicts(organizationId, {
          day: slot.day,
          startTime: slot.startTime,
          endTime: slot.endTime,
          validFrom,
          validTo: endDate,
          spaceId: defaultSpaceId,
          professorIds: input.professorIds
        })
      );
    }

    let item: HydratedDocument<DanceClass> | undefined;
    try {
      item = await DanceClassModel.create({
        organizationId,
        ...fields,
        ...(["MONTHLY", "BOTH"].includes(input.billingMode)
          ? { monthlyPrice: monthlyPrice4 ?? fields.monthlyPrice, monthlyPrice4, monthlyPrice8 }
          : {}),
        defaultSpaceId,
        status: "ACTIVE"
      });

      // Recurring schedule with validity. A plain creation starts today and has no end.
      if (startDate || endDate || defaultSpaceId) {
        for (const slot of input.schedules) {
          await createScheduleSeries(
            actorOf(request),
            item.id,
            { ...slot, spaceId: defaultSpaceId },
            validFrom,
            endDate,
            // `item.schedules` is the cache that was just submitted.  Do not bootstrap
            // it before creating this first real rule or the group would conflict with
            // its own newly-created schedule.
            { bootstrapLegacySchedules: false }
          );
        }
      } else {
        await ensureScheduleRules(organizationId, [item.toObject() as any]);
      }
    } catch (error) {
      // A failed creation must never leave a group that is invisible to the user but
      // blocks the same professor or pista on a later attempt.
      if (item) {
        await Promise.all([
          ClassSessionModel.deleteMany({ organizationId, classId: item._id }),
          ClassScheduleModel.deleteMany({ organizationId, classId: item._id }),
          AuditLogModel.deleteMany({ organizationId, entityId: item._id, action: "SCHEDULE_SERIES_CREATED" })
        ]).catch(() => undefined);
        await DanceClassModel.deleteOne({ _id: item._id, organizationId }).catch(() => undefined);
      }
      throw error;
    }

    if (!item) throw new AppError(500, "No se pudo crear la clase", "CLASS_CREATE_FAILED");

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
      monthlyPrice4: item.monthlyPrice4 ?? null,
      monthlyPrice8: item.monthlyPrice8 ?? null,
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
      // Capacity is per session: compare with the busiest recurring slot, not the group total.
      const busiest = Math.max(0, ...(await seriesOccupancy(organizationId, item.toObject())).map((slot) => slot.occupied));

      if (input.capacity < busiest) {
        throw new AppError(
          409,
          `El cupo no puede ser menor a los ${busiest} alumnos inscriptos en un mismo horario`,
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
    if (input.monthlyPrice4 !== undefined) {
      item.monthlyPrice4 = input.monthlyPrice4 ?? undefined;
      if (input.monthlyPrice4 !== null) item.monthlyPrice = input.monthlyPrice4;
    }
    if (input.monthlyPrice8 !== undefined) item.monthlyPrice8 = input.monthlyPrice8 ?? undefined;
    if (input.freeTrialEnabled !== undefined) item.freeTrialEnabled = input.freeTrialEnabled;
    const archiving = (input.status === "INACTIVE" || input.status === "ARCHIVED") && !isArchivedStatus(item.status);
    const unarchiving = input.status === "ACTIVE" && isArchivedStatus(item.status);
    if (unarchiving) {
      item.status = "ACTIVE";
      item.archivedAt = undefined;
    }
    if (input.publishOnWeb !== undefined) item.publishOnWeb = input.publishOnWeb;
    if (input.defaultSpaceId !== undefined) {
      item.defaultSpaceId = input.defaultSpaceId ? new Types.ObjectId(input.defaultSpaceId) : undefined;
    }

    await item.save();

    // Recurring slots change from today on through versioned rules: past sessions keep their
    // schedule, enrollments follow their series and no ghost sessions are created.
    if (input.schedules !== undefined && !archiving) {
      await applyWeeklySchedules(actorOf(request), item.id, input.schedules);
    }
    let archive: { enrollmentsClosed: number } | undefined;
    if (archiving) {
      archive = await archiveGroup(actorOf(request), item.id, academyNow().date, "Clase archivada");
    }
    const refreshed = await DanceClassModel.findById(item._id);
    if (refreshed) {
      item.schedules = refreshed.schedules;
      item.status = refreshed.status;
    }

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
          monthlyPrice4: item.monthlyPrice4 ?? null,
          monthlyPrice8: item.monthlyPrice8 ?? null,
          freeTrialEnabled: item.freeTrialEnabled ?? false,
          schedules: item.schedules,
          status: item.status,
          publishOnWeb: item.publishOnWeb ?? true
        },
        ...(enrollmentsReconciled !== undefined ? { enrollmentsReconciled } : {}),
        ...(archive ? { enrollmentsClosed: archive.enrollmentsClosed } : {})
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

    // Future sessions are generated automatically when a class is created; they are planning
    // data, not history. A new class must remain removable until it has real activity.
    const now = academyNow();
    const sessions = await ClassSessionModel.find({ organizationId, classId: item._id })
      .select("_id sessionDate startTime status")
      .lean();
    const sessionIds = sessions.map((session) => session._id);
    const pastOrStartedSessions = sessions.filter(
      (session) =>
        session.sessionDate < now.date ||
        (session.sessionDate === now.date && session.startTime <= now.time) ||
        ["IN_PROGRESS", "COMPLETED"].includes(session.status)
    );

    const [enrollmentCount, paymentCount, chargeCount, trialCount, attendanceCount, bookingCount] = await Promise.all([
      EnrollmentModel.countDocuments({ organizationId, classId: item._id }),
      PaymentModel.countDocuments({ organizationId, classId: item._id }),
      ChargeModel.countDocuments({ organizationId, classId: item._id }),
      TrialBookingModel.countDocuments({ organizationId, classId: item._id }),
      sessionIds.length ? ClassAttendanceModel.countDocuments({ organizationId, sessionId: { $in: sessionIds } }) : 0,
      sessionIds.length ? SessionBookingModel.countDocuments({ organizationId, sessionId: { $in: sessionIds } }) : 0
    ]);

    const dependencies = [
      [enrollmentCount, "inscripción", "inscripciones"],
      [paymentCount, "pago", "pagos"],
      [chargeCount, "cargo", "cargos"],
      [trialCount, "prueba", "pruebas"],
      [pastOrStartedSessions.length, "sesión anterior", "sesiones anteriores"],
      [attendanceCount + bookingCount, "registro de alumno en una sesión", "registros de alumnos en sesiones"]
    ] as const;
    const history = dependencies
      .filter(([count]) => count > 0)
      .map(([count, singular, plural]) => `${count} ${count === 1 ? singular : plural}`);

    if (history.length > 0) {
      throw new AppError(
        409,
        `No se puede eliminar la clase porque tiene historial asociado: ${history.join(", ")}. Usá “Inactivar clase” para retirarla de la operación futura y conservar ese historial.`,
        "CLASS_HAS_HISTORY"
      );
    }

    // There is no academic activity, so discard the generated planning records together with
    // the class. Removing rules first prevents a concurrent generator from recreating sessions.
    await ClassScheduleModel.deleteMany({ organizationId, classId: item._id });
    if (sessionIds.length) await ClassSessionModel.deleteMany({ organizationId, _id: { $in: sessionIds } });
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

const pauseSchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema.optional(),
  reason: z.string().trim().max(300).optional()
});

/** Pause: no regular sessions while it lasts; history and enrollments stay. */
adminClassesRouter.post("/:id/pause", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = pauseSchema.parse(request.body);
    response.json(await pauseGroup(actorOf(request), id, input));
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.post("/:id/resume", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { date } = z.object({ date: calendarDateSchema.optional() }).parse(request.body ?? {});
    response.json(await resumeGroup(actorOf(request), id, date ?? academyNow().date));
  } catch (error) {
    next(error);
  }
});

/** Archive: keeps history; ends schedules and open enrollments from the given day. */
adminClassesRouter.post("/:id/archive", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = z
      .object({ date: calendarDateSchema.optional(), reason: z.string().trim().max(300).optional() })
      .parse(request.body ?? {});
    response.json(await archiveGroup(actorOf(request), id, input.date ?? academyNow().date, input.reason || "Clase archivada"));
  } catch (error) {
    next(error);
  }
});
