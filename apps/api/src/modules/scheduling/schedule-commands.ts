import type { WeekDay } from "@mym/shared";
import { Types, type ClientSession } from "mongoose";
import { academyNow, addDays, weekDayFor } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel, isArchivedStatus } from "../classes/class.model";
import { ChargeModel } from "../billing/charge.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { closeEnrollment } from "../enrollments/enrollment-service";
import { PaymentModel } from "../payments/payment.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel, slotKeyOf } from "../sessions/class-session.model";
import { SessionBookingModel } from "../sessions/session-booking.model";
import { ClassScheduleModel } from "./class-schedule.model";
import { assertNoConflicts, assertUsableSpace, findRuleConflicts, RULES_LOCK_KEY } from "./conflict-service";
import { ensureLocks, touchLocks } from "./resource-lock.model";
import {
  assertNotRetroactive,
  assertValidSlot,
  dayBefore,
  ensureScheduleRules,
  loadRules,
  normalizedProfessorIds,
  refreshScheduleCache,
  ruleCoversDate,
  slotKey,
  type ScheduleRule,
  type SlotInput
} from "./schedule-service";
import { generateSessions, rollingWindow } from "./session-generator";
import type { Actor } from "./session-commands";

async function loadGroup(organizationId: string, classId: string | Types.ObjectId, dbSession?: ClientSession) {
  const danceClass = await DanceClassModel.findOne({ _id: classId, organizationId }).session(dbSession ?? null).lean<any>();
  if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
  return danceClass;
}

async function audit(actor: Actor, action: string, entityId: Types.ObjectId, metadata: Record<string, unknown>, dbSession?: ClientSession) {
  await AuditLogModel.create(
    [{ organizationId: actor.organizationId, actorUserId: actor.userId, action, entityType: "ClassSchedule", entityId, metadata }],
    { session: dbSession }
  );
}

/** Validates a slot of a group against its other slots and the rest of the academy. */
async function assertRuleFits(
  actor: Actor,
  danceClass: any,
  rule: { day: string; startTime: string; endTime: string; validFrom: string; validTo?: string; spaceId?: unknown; professorIds: unknown[] },
  excludeSeriesIds: Array<Types.ObjectId | string>,
  dbSession?: ClientSession
) {
  assertValidSlot(rule);
  if (rule.spaceId) await assertUsableSpace(actor.organizationId, rule.spaceId as string, danceClass.branchId, dbSession);

  const own = (await loadRules(actor.organizationId, { classIds: [danceClass._id], from: rule.validFrom }, dbSession)).filter(
    (item) =>
      !excludeSeriesIds.map(String).includes(String(item.seriesId)) &&
      item.day === rule.day &&
      item.startTime < rule.endTime &&
      rule.startTime < item.endTime &&
      (!rule.validTo || item.validFrom <= rule.validTo)
  );
  if (own.length) {
    throw new AppError(409, "La clase ya tiene un horario que se superpone", "SCHEDULE_OVERLAP");
  }

  assertNoConflicts(
    await findRuleConflicts(
      actor.organizationId,
      {
        ...rule,
        spaceId: rule.spaceId as string | undefined,
        professorIds: (rule.professorIds.length ? rule.professorIds : danceClass.professorIds) as Types.ObjectId[],
        excludeSeriesIds,
        excludeClassId: danceClass._id
      },
      dbSession
    )
  );
}

/** Activity that makes a session part of history (it can be cancelled, never deleted). */
async function sessionsWithActivity(organizationId: string, sessionIds: Types.ObjectId[], dbSession?: ClientSession) {
  if (!sessionIds.length) return new Set<string>();
  const [attendance, bookings, payments] = await Promise.all([
    ClassAttendanceModel.distinct("sessionId", { organizationId, sessionId: { $in: sessionIds } }).session(dbSession ?? null),
    SessionBookingModel.distinct("sessionId", { organizationId, sessionId: { $in: sessionIds } }).session(dbSession ?? null),
    PaymentModel.distinct("sessionId", { organizationId, sessionId: { $in: sessionIds } }).session(dbSession ?? null)
  ]);
  const charges = await ChargeModel.distinct("sessionId", { organizationId, sessionId: { $in: sessionIds } }).session(dbSession ?? null);
  return new Set([...attendance, ...bookings, ...payments, ...charges].map(String));
}

/**
 * Applies a series change to the sessions already generated from `fromDate` on. Sessions edited
 * by hand, past or no longer scheduled are left alone. Same weekday: updated in place (identity
 * kept). Different weekday: removed when untouched, cancelled with a reason otherwise.
 */
async function reconcileFutureSessions(
  actor: Actor,
  seriesId: Types.ObjectId,
  fromDate: string,
  version: ScheduleRule | null,
  reason: string,
  dbSession?: ClientSession
) {
  const sessions = await ClassSessionModel.find({
    organizationId: actor.organizationId,
    seriesId,
    origin: "REGULAR",
    occurrenceDate: { $gte: fromDate },
    status: { $in: ["SCHEDULED", "SUSPENDED"] },
    manualOverride: { $ne: true }
  }).session(dbSession ?? null);

  const outdated = sessions.filter((item) => !version || weekDayFor(item.occurrenceDate!) !== version.day || !ruleCoversDate(version, item.occurrenceDate!));
  const active = new Set([...await sessionsWithActivity(actor.organizationId, outdated.map((item) => item._id), dbSession)]);

  for (const session of sessions) {
    if (outdated.includes(session)) {
      if (active.has(String(session._id))) {
        session.statusHistory.push({ from: session.status, to: "CANCELLED", reason, userId: new Types.ObjectId(actor.userId), at: new Date() } as never);
        session.status = "CANCELLED";
        session.statusReason = reason;
        session.slotKey = undefined;
        await session.save({ session: dbSession });
      } else {
        await ClassSessionModel.deleteOne({ _id: session._id }, { session: dbSession });
      }
      continue;
    }
    session.startTime = version!.startTime;
    session.endTime = version!.endTime;
    session.scheduleId = version!._id;
    session.spaceId = version!.spaceId;
    session.professorIds = version!.professorIds ?? [];
    if (session.status === "SCHEDULED") session.slotKey = slotKeyOf(session);
    await session.save({ session: dbSession }).catch((error) => {
      if ((error as { code?: number })?.code === 11000) {
        throw new AppError(409, "El nuevo horario choca con otra sesión de la clase", "SESSION_SLOT_TAKEN");
      }
      throw error;
    });
  }
}

/** Adds a recurring slot to a group from `validFrom` (optionally until `validTo`). */
export async function createScheduleSeries(
  actor: Actor,
  classId: string,
  slot: SlotInput,
  validFrom: string,
  validTo?: string
) {
  assertNotRetroactive(validFrom);
  if (validTo && validTo < validFrom) throw new AppError(422, "La vigencia termina antes de empezar", "INVALID_VALIDITY");
  await ensureLocks(actor.organizationId, [RULES_LOCK_KEY]);
  const danceClass = await loadGroup(actor.organizationId, classId);
  await ensureScheduleRules(actor.organizationId, [danceClass]);

  const rule = await withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, [RULES_LOCK_KEY], dbSession);
    const group = await loadGroup(actor.organizationId, classId, dbSession);
    if (isArchivedStatus(group.status)) throw new AppError(409, "La clase está archivada", "CLASS_ARCHIVED");
    const candidate = {
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      validFrom,
      validTo,
      spaceId: slot.spaceId ?? undefined,
      professorIds: normalizedProfessorIds(slot.professorIds)
    };
    await assertRuleFits(actor, group, candidate, [], dbSession);
    const [created] = await ClassScheduleModel.create(
      [{ ...candidate, organizationId: group.organizationId, branchId: group.branchId, classId: group._id, seriesId: new Types.ObjectId(), createdByUserId: actor.userId }],
      { session: dbSession }
    );
    await refreshScheduleCache(actor.organizationId, group._id, dbSession);
    await audit(actor, "SCHEDULE_SERIES_CREATED", created._id, { classId: group._id, ...candidate }, dbSession);
    return created;
  });

  await generateSessions(actor.organizationId, { ...rollingWindow(academyNow().date, 0), classIds: [danceClass._id] });
  return rule;
}

export interface SeriesChange {
  day?: WeekDay;
  startTime?: string;
  endTime?: string;
  spaceId?: string | null;
  professorIds?: string[];
}

/**
 * "This session and the following ones": the version in force on `fromDate` is closed the day
 * before and a new version with the changes starts on `fromDate`. Sessions already generated
 * keep their identity; past sessions are never touched.
 */
export async function changeScheduleSeries(actor: Actor, seriesId: string, fromDate: string, changes: SeriesChange, reason = "Cambio de horario") {
  assertNotRetroactive(fromDate);
  await ensureLocks(actor.organizationId, [RULES_LOCK_KEY]);
  const seriesObjectId = new Types.ObjectId(seriesId);

  const version = await withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, [RULES_LOCK_KEY], dbSession);
    const versions = await loadRules(actor.organizationId, { seriesId: seriesObjectId }, dbSession);
    if (!versions.length) throw new AppError(404, "Horario no encontrado", "SCHEDULE_NOT_FOUND");
    const current = versions.find((item) => ruleCoversDate(item, fromDate)) ?? versions.find((item) => item.validFrom > fromDate);
    if (!current) throw new AppError(409, "El horario ya no está vigente en esa fecha", "SCHEDULE_ENDED");
    const group = await loadGroup(actor.organizationId, current.classId, dbSession);

    const next = {
      day: changes.day ?? current.day,
      startTime: changes.startTime ?? current.startTime,
      endTime: changes.endTime ?? current.endTime,
      spaceId: changes.spaceId === undefined ? current.spaceId : changes.spaceId ? new Types.ObjectId(changes.spaceId) : undefined,
      professorIds: changes.professorIds === undefined ? current.professorIds : normalizedProfessorIds(changes.professorIds),
      validFrom: current.validFrom > fromDate ? current.validFrom : fromDate,
      validTo: current.validTo
    };
    await assertRuleFits(actor, group, next, [seriesObjectId], dbSession);

    let updated: ScheduleRule;
    if (next.validFrom === current.validFrom) {
      // The version has not been in force yet: change it in place.
      await ClassScheduleModel.updateOne(
        { _id: current._id },
        { $set: { day: next.day, startTime: next.startTime, endTime: next.endTime, professorIds: next.professorIds, ...(next.spaceId ? { spaceId: next.spaceId } : {}) }, ...(next.spaceId ? {} : { $unset: { spaceId: 1 } }) },
        { session: dbSession }
      );
      updated = { ...current, ...next } as ScheduleRule;
    } else {
      await ClassScheduleModel.updateOne({ _id: current._id }, { $set: { validTo: dayBefore(fromDate) } }, { session: dbSession });
      const [created] = await ClassScheduleModel.create(
        [{
          organizationId: current.organizationId,
          branchId: current.branchId,
          classId: current.classId,
          seriesId: current.seriesId,
          ...next,
          createdByUserId: actor.userId
        }],
        { session: dbSession }
      );
      updated = created.toObject() as ScheduleRule;
    }

    await reconcileFutureSessions(actor, seriesObjectId, fromDate, updated, reason, dbSession);
    await refreshScheduleCache(actor.organizationId, current.classId, dbSession);
    await audit(actor, "SCHEDULE_SERIES_CHANGED", updated._id, {
      seriesId,
      fromDate,
      before: { day: current.day, startTime: current.startTime, endTime: current.endTime, spaceId: current.spaceId ?? null },
      after: { day: next.day, startTime: next.startTime, endTime: next.endTime, spaceId: next.spaceId ?? null },
      reason
    }, dbSession);
    return updated;
  });

  await generateSessions(actor.organizationId, { ...rollingWindow(academyNow().date, 0), classIds: [version.classId] });
  return version;
}

/** Ends a series: no sessions from `fromDate` on. Generated future sessions are removed or cancelled. */
export async function endScheduleSeries(actor: Actor, seriesId: string, fromDate: string, reason = "Fin del horario") {
  assertNotRetroactive(fromDate);
  await ensureLocks(actor.organizationId, [RULES_LOCK_KEY]);
  const seriesObjectId = new Types.ObjectId(seriesId);

  return withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, [RULES_LOCK_KEY], dbSession);
    const versions = await loadRules(actor.organizationId, { seriesId: seriesObjectId }, dbSession);
    if (!versions.length) throw new AppError(404, "Horario no encontrado", "SCHEDULE_NOT_FOUND");

    for (const version of versions) {
      if (version.validFrom >= fromDate) {
        // Never in force: drop it (no session can reference it after reconciliation below).
        await ClassScheduleModel.deleteOne({ _id: version._id }, { session: dbSession });
      } else if (!version.validTo || version.validTo >= fromDate) {
        await ClassScheduleModel.updateOne(
          { _id: version._id },
          { $set: { validTo: dayBefore(fromDate), endedReason: reason } },
          { session: dbSession }
        );
      }
    }

    await reconcileFutureSessions(actor, seriesObjectId, fromDate, null, reason, dbSession);
    await refreshScheduleCache(actor.organizationId, versions[0].classId, dbSession);
    await audit(actor, "SCHEDULE_SERIES_ENDED", versions[0]._id, { seriesId, fromDate, reason }, dbSession);
    return { seriesId, endedFrom: fromDate };
  });
}

/**
 * Compatibility for screens that still send the whole weekly `schedules` array of a group:
 * the difference with the slots valid today becomes rule operations effective today.
 * Unchanged slots keep their series; a slot whose times changed on the same weekday keeps its
 * series too (so enrollments follow it); removed slots end; new slots start.
 */
export async function applyWeeklySchedules(
  actor: Actor,
  classId: string,
  schedules: Array<{ day: WeekDay; startTime: string; endTime: string }>
) {
  const today = academyNow().date;
  const danceClass = await loadGroup(actor.organizationId, classId);
  await ensureScheduleRules(actor.organizationId, [danceClass]);
  const current = (await loadRules(actor.organizationId, { classIds: [danceClass._id], from: today })).filter(
    (rule) => ruleCoversDate(rule, today) || rule.validFrom > today
  );

  const wanted = schedules.map((slot) => ({ ...slot, key: slotKey(slot) }));
  const remainingCurrent = current.filter((rule) => !wanted.some((slot) => slot.key === slotKey(rule)));
  const remainingWanted = wanted.filter((slot) => !current.some((rule) => slotKey(rule) === slot.key));

  const pairs: Array<{ rule: ScheduleRule; slot: (typeof wanted)[number] }> = [];
  for (const slot of [...remainingWanted]) {
    const sameDay = remainingCurrent.filter((rule) => rule.day === slot.day);
    const match = sameDay.find((rule) => rule.startTime === slot.startTime) ?? sameDay[0];
    if (!match) continue;
    pairs.push({ rule: match, slot });
    remainingCurrent.splice(remainingCurrent.indexOf(match), 1);
    remainingWanted.splice(remainingWanted.indexOf(slot), 1);
  }

  for (const rule of remainingCurrent) await endScheduleSeries(actor, String(rule.seriesId), today, "Horario quitado de la clase");
  for (const { rule, slot } of pairs) {
    await changeScheduleSeries(actor, String(rule.seriesId), today, { startTime: slot.startTime, endTime: slot.endTime });
  }
  for (const slot of remainingWanted) {
    await createScheduleSeries(actor, classId, { day: slot.day, startTime: slot.startTime, endTime: slot.endTime }, today);
  }

  return refreshScheduleCache(actor.organizationId, danceClass._id);
}

/** Pauses a group: no regular sessions in [from, to]. Generated untouched sessions are suspended. */
export async function pauseGroup(actor: Actor, classId: string, input: { from: string; to?: string; reason?: string }) {
  assertNotRetroactive(input.from);
  if (input.to && input.to < input.from) throw new AppError(422, "La pausa termina antes de empezar", "INVALID_VALIDITY");
  return withTransaction(async (dbSession) => {
    const danceClass = await DanceClassModel.findOne({ _id: classId, organizationId: actor.organizationId }).session(dbSession ?? null);
    if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    if (isArchivedStatus(danceClass.status)) throw new AppError(409, "La clase está archivada", "CLASS_ARCHIVED");
    if (danceClass.pauses.some((pause) => !pause.to)) {
      throw new AppError(409, "La clase ya tiene una pausa abierta", "CLASS_ALREADY_PAUSED");
    }
    danceClass.pauses.push({ from: input.from, to: input.to, reason: input.reason, createdByUserId: new Types.ObjectId(actor.userId) } as never);
    if (input.from <= academyNow().date) danceClass.status = "PAUSED";
    await danceClass.save({ session: dbSession });

    const reason = input.reason?.trim() ? `Clase en pausa: ${input.reason.trim()}` : "Clase en pausa";
    const affected = await ClassSessionModel.find({
      organizationId: actor.organizationId,
      classId: danceClass._id,
      origin: "REGULAR",
      sessionDate: { $gte: input.from, ...(input.to ? { $lte: input.to } : {}) },
      status: "SCHEDULED"
    }).session(dbSession ?? null);
    for (const session of affected) {
      session.statusHistory.push({ from: "SCHEDULED", to: "SUSPENDED", reason, userId: new Types.ObjectId(actor.userId), at: new Date() } as never);
      session.status = "SUSPENDED";
      session.statusReason = reason;
      session.slotKey = undefined;
      await session.save({ session: dbSession });
    }

    await AuditLogModel.create(
      [{ organizationId: actor.organizationId, actorUserId: actor.userId, action: "CLASS_PAUSED", entityType: "DanceClass", entityId: danceClass._id, metadata: { ...input, suspendedSessions: affected.length } }],
      { session: dbSession }
    );
    return danceClass;
  });
}

/** Resumes a paused group from `date`: the open pause closes the day before. */
export async function resumeGroup(actor: Actor, classId: string, date: string) {
  assertNotRetroactive(date);
  const danceClass = await DanceClassModel.findOne({ _id: classId, organizationId: actor.organizationId });
  if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
  const open = danceClass.pauses.find((pause) => !pause.to || pause.to >= date);
  if (!open) throw new AppError(409, "La clase no está en pausa", "CLASS_NOT_PAUSED");
  if (open.from >= date) {
    // The pause never started: drop it instead of leaving an empty range.
    danceClass.pauses = danceClass.pauses.filter((pause) => pause !== open);
  } else {
    open.to = addDays(date, -1);
  }
  danceClass.markModified("pauses");
  danceClass.status = "ACTIVE";
  await danceClass.save();

  // Sessions suspended only because of this pause come back (identity, roster and charges intact).
  const suspended = await ClassSessionModel.find({
    organizationId: actor.organizationId,
    classId: danceClass._id,
    status: "SUSPENDED",
    sessionDate: { $gte: date },
    statusReason: /^Clase en pausa/
  });
  for (const session of suspended) {
    session.statusHistory.push({ from: "SUSPENDED", to: "SCHEDULED", reason: "Fin de la pausa", userId: new Types.ObjectId(actor.userId), at: new Date() } as never);
    session.status = "SCHEDULED";
    session.statusReason = undefined;
    session.slotKey = slotKeyOf(session);
    await session.save().catch((error) => {
      if ((error as { code?: number })?.code !== 11000) throw error;
    });
  }

  await AuditLogModel.create({
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    action: "CLASS_RESUMED",
    entityType: "DanceClass",
    entityId: danceClass._id,
    metadata: { date }
  });
  await generateSessions(actor.organizationId, { ...rollingWindow(academyNow().date, 0), classIds: [danceClass._id] });
  return danceClass;
}

/**
 * Archives a group: history stays, but no new enrollments, schedules or sessions. Open
 * enrollments end the day before `date` and untouched future sessions are removed.
 */
export async function archiveGroup(actor: Actor, classId: string, date: string, reason = "Clase archivada") {
  assertNotRetroactive(date);
  await ensureLocks(actor.organizationId, [RULES_LOCK_KEY]);
  const danceClass = await loadGroup(actor.organizationId, classId);
  await ensureScheduleRules(actor.organizationId, [danceClass]);
  const rules = await loadRules(actor.organizationId, { classIds: [danceClass._id], from: date });
  for (const seriesId of new Set(rules.map((rule) => String(rule.seriesId)))) {
    await endScheduleSeries(actor, seriesId, date, reason);
  }

  return withTransaction(async (dbSession) => {
    const lastDay = dayBefore(date);
    const enrollments = await EnrollmentModel.find({ organizationId: actor.organizationId, classId: danceClass._id, status: "ACTIVE" }).session(dbSession ?? null);
    for (const enrollment of enrollments) closeEnrollment(enrollment, lastDay, reason);
    await Promise.all(enrollments.map((item) => item.save({ session: dbSession })));
    await DanceClassModel.updateOne(
      { _id: danceClass._id },
      { $set: { status: "ARCHIVED", archivedAt: new Date() } },
      { session: dbSession }
    );
    await AuditLogModel.create(
      [{ organizationId: actor.organizationId, actorUserId: actor.userId, action: "CLASS_ARCHIVED", entityType: "DanceClass", entityId: danceClass._id, metadata: { date, reason, enrollmentsClosed: enrollments.length } }],
      { session: dbSession }
    );
    return { enrollmentsClosed: enrollments.length };
  });
}
