import type { WeekDay } from "@mym/shared";
import { Types, type ClientSession } from "mongoose";
import { academyDateOf, academyNow, addDays } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ClassScheduleModel, type ClassSchedule } from "./class-schedule.model";

export type ScheduleRule = ClassSchedule & { _id: Types.ObjectId };

export interface SlotInput {
  day: WeekDay;
  startTime: string;
  endTime: string;
  spaceId?: string | null;
  professorIds?: string[];
}

interface ClassForRules {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  schedules?: Array<{ day: string; startTime: string; endTime: string }>;
  createdAt?: Date;
}

/** Legacy weekly slot key, also used by Enrollment.scheduleKeys. */
export function slotKey(slot: { day: string; startTime: string; endTime: string }) {
  return `${slot.day}:${slot.startTime}:${slot.endTime}`;
}

export function ruleCoversDate(rule: { validFrom: string; validTo?: string | null }, date: string) {
  return rule.validFrom <= date && (!rule.validTo || date <= rule.validTo);
}

export function rangesOverlap(
  a: { validFrom: string; validTo?: string | null },
  b: { validFrom: string; validTo?: string | null }
) {
  return a.validFrom <= (b.validTo ?? "9999-12-31") && b.validFrom <= (a.validTo ?? "9999-12-31");
}

/** Version of a series that applies on a date (versions of a series never overlap). */
export function versionOn(versions: ScheduleRule[], seriesId: unknown, date: string) {
  return versions.find((rule) => String(rule.seriesId) === String(seriesId) && ruleCoversDate(rule, date));
}

/**
 * Creates the recurring rules of groups that predate ClassSchedule, one series per weekly slot,
 * valid from the group's creation day. Idempotent: the unique legacyKey index absorbs races.
 * Also translates the enrollments' legacy slot keys into series ids.
 */
export async function ensureScheduleRules(organizationId: string, classes: ClassForRules[]) {
  if (!classes.length) return;
  const classIds = classes.map((item) => item._id);
  const withRules = new Set(
    (await ClassScheduleModel.distinct("classId", { organizationId, classId: { $in: classIds } })).map(String)
  );
  const missing = classes.filter((item) => !withRules.has(String(item._id)) && item.schedules?.length);
  if (!missing.length) return;

  const documents = missing.flatMap((danceClass) => {
    const validFrom = academyDateOf(danceClass.createdAt ?? new Date());
    const seen = new Set<string>();
    return (danceClass.schedules ?? [])
      .filter((slot) => {
        const key = slotKey(slot);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((slot) => ({
        organizationId: danceClass.organizationId,
        branchId: danceClass.branchId,
        classId: danceClass._id,
        seriesId: new Types.ObjectId(),
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        validFrom,
        professorIds: [],
        legacyKey: slotKey(slot)
      }));
  });

  await ClassScheduleModel.insertMany(documents, { ordered: false }).catch((error: any) => {
    const failures = error?.writeErrors ?? [];
    if (!failures.length || failures.some((item: any) => (item.code ?? item.err?.code) !== 11000)) throw error;
  });

  const rules = await ClassScheduleModel.find({
    organizationId,
    classId: { $in: missing.map((item) => item._id) },
    legacyKey: { $type: "string" }
  }).lean<ScheduleRule[]>();

  for (const danceClass of missing) {
    const seriesByKey = new Map(
      rules.filter((rule) => rule.classId.equals(danceClass._id)).map((rule) => [rule.legacyKey!, rule.seriesId])
    );
    const enrollments = await EnrollmentModel.find({
      organizationId,
      classId: danceClass._id,
      "scheduleKeys.0": { $exists: true },
      "seriesIds.0": { $exists: false }
    })
      .select("_id scheduleKeys")
      .lean<any[]>();
    for (const enrollment of enrollments) {
      const seriesIds = (enrollment.scheduleKeys as string[])
        .map((key) => seriesByKey.get(key))
        .filter((value): value is Types.ObjectId => Boolean(value));
      if (seriesIds.length) {
        await EnrollmentModel.updateOne(
          { _id: enrollment._id, "seriesIds.0": { $exists: false } },
          { $set: { seriesIds } }
        );
      }
    }
  }
}

export async function loadRules(
  organizationId: string,
  filter: { classIds?: Types.ObjectId[]; from?: string; to?: string; seriesId?: Types.ObjectId },
  session?: ClientSession
) {
  const query: Record<string, unknown> = { organizationId };
  if (filter.classIds) query.classId = { $in: filter.classIds };
  if (filter.seriesId) query.seriesId = filter.seriesId;
  if (filter.to) query.validFrom = { $lte: filter.to };
  if (filter.from) query.$or = [{ validTo: { $exists: false } }, { validTo: null }, { validTo: { $gte: filter.from } }];
  return ClassScheduleModel.find(query).sort({ validFrom: 1, startTime: 1 }).session(session ?? null).lean<ScheduleRule[]>();
}

/**
 * Rewrites DanceClass.schedules (read cache) from the rules valid today. A group that starts in
 * the future shows its first upcoming version so the website and portals can announce it.
 */
export async function refreshScheduleCache(
  organizationId: string,
  classId: Types.ObjectId,
  session?: ClientSession
) {
  const today = academyNow().date;
  const rules = await loadRules(organizationId, { classIds: [classId], from: today }, session);
  const bySeries = new Map<string, ScheduleRule>();
  for (const rule of rules) {
    const key = String(rule.seriesId);
    const current = bySeries.get(key);
    // Prefer the version valid today; otherwise the earliest upcoming one.
    if (!current || (ruleCoversDate(rule, today) && !ruleCoversDate(current, today))) bySeries.set(key, rule);
  }
  const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  const schedules = [...bySeries.values()]
    .map((rule) => ({ day: rule.day, startTime: rule.startTime, endTime: rule.endTime }))
    .sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.startTime.localeCompare(b.startTime));
  await DanceClassModel.updateOne({ _id: classId, organizationId }, { $set: { schedules } }, { session });
  return schedules;
}

export function assertValidSlot(slot: { startTime: string; endTime: string }) {
  if (slot.startTime >= slot.endTime) {
    throw new AppError(422, "La hora de fin debe ser posterior a la hora de inicio", "INVALID_TIME_RANGE");
  }
}

/** Rules may only change from today on: past sessions keep the schedule they had. */
export function assertNotRetroactive(date: string) {
  if (date < academyNow().date) {
    throw new AppError(422, "Los cambios de horario rigen desde hoy en adelante", "RETROACTIVE_SCHEDULE_CHANGE");
  }
}

export function normalizedProfessorIds(ids?: string[] | Types.ObjectId[]) {
  return [...new Set((ids ?? []).map(String))].map((id) => new Types.ObjectId(id));
}

/** Day before a calendar date, as the closing day of the previous version. */
export function dayBefore(date: string) {
  return addDays(date, -1);
}
