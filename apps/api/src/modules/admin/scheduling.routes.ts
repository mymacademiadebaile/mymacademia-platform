import { SESSION_STATUSES, WEEK_DAYS } from "@mym/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { academyNow, daysBetween, TIME_PATTERN } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassScheduleModel } from "../scheduling/class-schedule.model";
import { DanceSpaceModel, DANCE_SPACE_STATUSES } from "../scheduling/dance-space.model";
import { createHoliday, deleteHoliday } from "../scheduling/holiday-service";
import { HolidayModel } from "../scheduling/holiday.model";
import {
  changeScheduleSeries,
  createScheduleSeries,
  endScheduleSeries
} from "../scheduling/schedule-commands";
import { ensureScheduleRules } from "../scheduling/schedule-service";
import { generateSessions, MAX_GENERATION_DAYS } from "../scheduling/session-generator";
import { ClassSessionModel } from "../sessions/class-session.model";
import { rosterCounts } from "../sessions/roster-service";
import { calendarDateSchema, objectIdSchema } from "./admin.schemas";

const timeSchema = z.string().regex(TIME_PATTERN, "La hora debe tener formato HH:mm");
const actorOf = (request: Express.Request) => ({
  organizationId: request.auth!.organizationId,
  userId: request.auth!.userId
});

/* ----------------------------------------------------------------------------------------- */
/* Spaces                                                                                    */
/* ----------------------------------------------------------------------------------------- */

const spaceSchema = z.object({
  branchId: objectIdSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  capacity: z.number().int().min(1).max(1000).optional().nullable(),
  status: z.enum(DANCE_SPACE_STATUSES).default("ACTIVE"),
  availabilityNotes: z.string().trim().max(300).optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(1000).default(0)
});

export const adminSpacesRouter = Router();

adminSpacesRouter.get("/", async (request, response, next) => {
  try {
    const { branchId } = z.object({ branchId: objectIdSchema.optional() }).parse(request.query);
    const items = await DanceSpaceModel.find({ organizationId: request.auth!.organizationId, ...(branchId ? { branchId } : {}) })
      .sort({ sortOrder: 1, name: 1 })
      .lean();
    response.json({ items });
  } catch (error) {
    next(error);
  }
});

adminSpacesRouter.post("/", async (request, response, next) => {
  try {
    const input = spaceSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    if (!(await BranchModel.exists({ _id: input.branchId, organizationId, isActive: true }))) {
      throw new AppError(422, "La sede no es válida", "INVALID_BRANCH");
    }
    const space = await DanceSpaceModel.create({
      ...input,
      organizationId,
      capacity: input.capacity ?? undefined,
      description: input.description || undefined,
      availabilityNotes: input.availabilityNotes || undefined
    }).catch((error) => {
      if ((error as { code?: number })?.code === 11000) throw new AppError(409, "Ya existe una pista con ese nombre en la sede", "SPACE_EXISTS");
      throw error;
    });
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "SPACE_CREATED", entityType: "DanceSpace", entityId: space._id, metadata: input });
    response.status(201).json(space);
  } catch (error) {
    next(error);
  }
});

adminSpacesRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = spaceSchema.omit({ branchId: true }).partial().parse(request.body);
    const organizationId = request.auth!.organizationId;
    const space = await DanceSpaceModel.findOne({ _id: id, organizationId });
    if (!space) throw new AppError(404, "Pista no encontrada", "SPACE_NOT_FOUND");
    const before = space.toObject();
    if (input.name !== undefined) space.name = input.name;
    if (input.description !== undefined) space.description = input.description || undefined;
    if (input.capacity !== undefined) space.capacity = input.capacity ?? undefined;
    if (input.status !== undefined) space.status = input.status;
    if (input.availabilityNotes !== undefined) space.availabilityNotes = input.availabilityNotes || undefined;
    if (input.sortOrder !== undefined) space.sortOrder = input.sortOrder;
    await space.save().catch((error) => {
      if ((error as { code?: number })?.code === 11000) throw new AppError(409, "Ya existe una pista con ese nombre en la sede", "SPACE_EXISTS");
      throw error;
    });
    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "SPACE_UPDATED",
      entityType: "DanceSpace",
      entityId: space._id,
      metadata: { before: { name: before.name, status: before.status, capacity: before.capacity }, after: input }
    });
    response.json(space);
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Holidays                                                                                  */
/* ----------------------------------------------------------------------------------------- */

export const adminHolidaysRouter = Router();

adminHolidaysRouter.get("/", async (request, response, next) => {
  try {
    const query = z.object({ from: calendarDateSchema.optional(), to: calendarDateSchema.optional() }).parse(request.query);
    const filter: Record<string, unknown> = { organizationId: request.auth!.organizationId };
    if (query.from || query.to) filter.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    response.json({ items: await HolidayModel.find(filter).sort({ date: 1 }).lean() });
  } catch (error) {
    next(error);
  }
});

adminHolidaysRouter.post("/", async (request, response, next) => {
  try {
    const input = z
      .object({ date: calendarDateSchema, name: z.string().trim().min(2).max(120), branchId: objectIdSchema.optional() })
      .parse(request.body);
    response.status(201).json(await createHoliday(actorOf(request), input));
  } catch (error) {
    next(error);
  }
});

adminHolidaysRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    response.json(await deleteHoliday(actorOf(request), id));
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Recurring schedules                                                                        */
/* ----------------------------------------------------------------------------------------- */

const slotSchema = z.object({
  day: z.enum(WEEK_DAYS),
  startTime: timeSchema,
  endTime: timeSchema,
  spaceId: objectIdSchema.nullable().optional(),
  professorIds: z.array(objectIdSchema).max(10).optional()
});

export const adminSchedulesRouter = Router();

/** Every version of every series of a group (history included). */
adminSchedulesRouter.get("/", async (request, response, next) => {
  try {
    const { classId } = z.object({ classId: objectIdSchema }).parse(request.query);
    const organizationId = request.auth!.organizationId;
    const danceClass = await DanceClassModel.findOne({ _id: classId, organizationId }).lean<any>();
    if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    await ensureScheduleRules(organizationId, [danceClass]);
    const items = await ClassScheduleModel.find({ organizationId, classId }).sort({ day: 1, startTime: 1, validFrom: 1 }).lean();
    const today = academyNow().date;
    response.json({
      today,
      items: items.map((rule) => ({
        ...rule,
        state: rule.validFrom > today ? "UPCOMING" : rule.validTo && rule.validTo < today ? "ENDED" : "CURRENT"
      }))
    });
  } catch (error) {
    next(error);
  }
});

adminSchedulesRouter.post("/", async (request, response, next) => {
  try {
    const input = slotSchema
      .extend({ classId: objectIdSchema, validFrom: calendarDateSchema, validTo: calendarDateSchema.optional() })
      .parse(request.body);
    const { classId, validFrom, validTo, ...slot } = input;
    response.status(201).json(await createScheduleSeries(actorOf(request), classId, slot, validFrom, validTo));
  } catch (error) {
    next(error);
  }
});

/** "This session and the following ones" for a recurring slot. */
adminSchedulesRouter.post("/:seriesId/change", async (request, response, next) => {
  try {
    const seriesId = objectIdSchema.parse(request.params.seriesId);
    const input = slotSchema
      .partial()
      .extend({ fromDate: calendarDateSchema, reason: z.string().trim().max(300).optional() })
      .parse(request.body);
    const { fromDate, reason, ...changes } = input;
    response.json(await changeScheduleSeries(actorOf(request), seriesId, fromDate, changes, reason || undefined));
  } catch (error) {
    next(error);
  }
});

adminSchedulesRouter.post("/:seriesId/end", async (request, response, next) => {
  try {
    const seriesId = objectIdSchema.parse(request.params.seriesId);
    const input = z.object({ fromDate: calendarDateSchema, reason: z.string().trim().max(300).optional() }).parse(request.body);
    response.json(await endScheduleSeries(actorOf(request), seriesId, input.fromDate, input.reason || undefined));
  } catch (error) {
    next(error);
  }
});

/* ----------------------------------------------------------------------------------------- */
/* Calendar                                                                                  */
/* ----------------------------------------------------------------------------------------- */

const calendarQuerySchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  branchId: objectIdSchema.optional(),
  classId: objectIdSchema.optional(),
  professorId: objectIdSchema.optional(),
  disciplineId: objectIdSchema.optional(),
  spaceId: objectIdSchema.optional(),
  status: z.enum(SESSION_STATUSES).optional()
});

export const adminCalendarRouter = Router();

/**
 * Operational calendar. Missing regular sessions of the range are generated first (idempotent),
 * then filtered. Rescheduled originals are hidden by default; their replacement is shown.
 */
adminCalendarRouter.get("/", async (request, response, next) => {
  try {
    const query = calendarQuerySchema.parse(request.query);
    if (query.to < query.from || daysBetween(query.from, query.to) + 1 > MAX_GENERATION_DAYS) {
      throw new AppError(422, `Elegí un rango de hasta ${MAX_GENERATION_DAYS} días`, "INVALID_DATE_RANGE");
    }
    const organizationId = request.auth!.organizationId;
    await generateSessions(organizationId, { from: query.from, to: query.to });

    const classFilter: Record<string, unknown> = { organizationId };
    if (query.branchId) classFilter.branchId = query.branchId;
    if (query.classId) classFilter._id = query.classId;
    if (query.disciplineId) classFilter.disciplineIds = new Types.ObjectId(query.disciplineId);
    const classes = await DanceClassModel.find(classFilter)
      .select("name branchId capacity billingMode pricePerClass monthlyPrice professorIds disciplineIds levelIds status")
      .populate("disciplineIds levelIds", "name")
      .lean<any[]>();
    const classById = new Map(classes.map((item) => [String(item._id), item]));

    const sessionFilter: Record<string, unknown> = {
      organizationId,
      sessionDate: { $gte: query.from, $lte: query.to },
      classId: { $in: classes.map((item) => item._id) }
    };
    if (query.status) sessionFilter.status = query.status;
    else sessionFilter.status = { $ne: "RESCHEDULED" };
    if (query.spaceId) sessionFilter.spaceId = new Types.ObjectId(query.spaceId);
    let sessions = await ClassSessionModel.find(sessionFilter).sort({ sessionDate: 1, startTime: 1 }).lean<any[]>();

    const effectiveProfessors = (session: any) =>
      (session.professorIds?.length ? session.professorIds : classById.get(String(session.classId))?.professorIds ?? []).map(String);
    if (query.professorId) sessions = sessions.filter((session) => effectiveProfessors(session).includes(query.professorId!));

    const professorIds = [...new Set(sessions.flatMap(effectiveProfessors))];
    const spaceIds = [...new Set(sessions.map((item) => item.spaceId).filter(Boolean).map(String))];
    const [professors, spaces, counts] = await Promise.all([
      ProfessorModel.find({ organizationId, _id: { $in: professorIds } }).select("displayName avatarUrl").lean<any[]>(),
      DanceSpaceModel.find({ organizationId, _id: { $in: spaceIds } }).select("name").lean<any[]>(),
      rosterCounts(organizationId, sessions)
    ]);
    const professorById = new Map(professors.map((item) => [String(item._id), item]));
    const spaceById = new Map(spaces.map((item) => [String(item._id), item]));

    response.json({
      from: query.from,
      to: query.to,
      today: academyNow().date,
      items: sessions.map((session) => {
        const danceClass = classById.get(String(session.classId));
        return {
          id: String(session._id),
          date: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status,
          statusReason: session.statusReason,
          origin: session.origin ?? "REGULAR",
          substitute: Boolean(session.substitute),
          manualOverride: Boolean(session.manualOverride),
          seriesId: session.seriesId ? String(session.seriesId) : null,
          class: {
            id: String(danceClass._id),
            name: danceClass.name,
            capacity: danceClass.capacity,
            billingMode: danceClass.billingMode ?? "MONTHLY",
            disciplines: (danceClass.disciplineIds ?? []).map((item: any) => ({ id: String(item._id), name: item.name })),
            levels: (danceClass.levelIds ?? []).map((item: any) => ({ id: String(item._id), name: item.name }))
          },
          professors: effectiveProfessors(session)
            .map((id: string) => professorById.get(id))
            .filter(Boolean)
            .map((item: any) => ({ id: String(item._id), displayName: item.displayName, avatarUrl: item.avatarUrl })),
          space: session.spaceId ? { id: String(session.spaceId), name: spaceById.get(String(session.spaceId))?.name ?? "" } : null,
          enrolledCount: counts.get(String(session._id)) ?? 0
        };
      })
    });
  } catch (error) {
    next(error);
  }
});
