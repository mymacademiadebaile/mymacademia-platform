import { Types } from "mongoose";
import { addDays, dateRange, daysBetween, weekDayFor } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import {
  DanceClassModel,
  SCHEDULABLE_CLASS_STATUSES,
  isPausedOn,
  type DanceClass
} from "../classes/class.model";
import { ClassSessionModel, slotKeyOf } from "../sessions/class-session.model";
import { HolidayModel } from "./holiday.model";
import { ensureScheduleRules, loadRules, type ScheduleRule } from "./schedule-service";

/** Largest range generated in one call. Longer calendars must page. */
export const MAX_GENERATION_DAYS = 120;

type ClassDoc = DanceClass & { _id: Types.ObjectId; createdAt?: Date };

export interface PlannedOccurrence {
  classId: Types.ObjectId;
  branchId: Types.ObjectId;
  rule: ScheduleRule;
  date: string;
  holiday?: string;
}

export function occurrenceKeyOf(seriesId: unknown, date: string) {
  return `${String(seriesId)}:${date}`;
}

/**
 * Pure planning step: every occurrence the rules produce in [from, to], skipping paused days.
 * Holidays are kept and flagged, so the session exists (suspended) and can be rescheduled.
 */
export function planOccurrences(
  classes: ClassDoc[],
  rules: ScheduleRule[],
  holidays: Array<{ date: string; name: string; branchId?: Types.ObjectId | null }>,
  from: string,
  to: string
): PlannedOccurrence[] {
  const classById = new Map(classes.map((item) => [String(item._id), item]));
  const planned: PlannedOccurrence[] = [];
  const dates = dateRange(from, to);

  for (const rule of rules) {
    const danceClass = classById.get(String(rule.classId));
    if (!danceClass) continue;
    for (const date of dates) {
      if (date < rule.validFrom || (rule.validTo && date > rule.validTo)) continue;
      if (weekDayFor(date) !== rule.day) continue;
      if (isPausedOn(danceClass, date)) continue;
      const holiday = holidays.find(
        (item) => item.date === date && (!item.branchId || item.branchId.equals(danceClass.branchId))
      );
      planned.push({ classId: danceClass._id, branchId: danceClass.branchId, rule, date, holiday: holiday?.name });
    }
  }

  return planned.sort((a, b) => (a.date + a.rule.startTime).localeCompare(b.date + b.rule.startTime));
}

function ignoreDuplicateKeyErrors(error: any) {
  const failures = error?.writeErrors ?? error?.result?.writeErrors ?? [];
  const onlyDuplicates =
    failures.length > 0 && failures.every((item: any) => (item.code ?? item.err?.code) === 11000);
  if (!onlyDuplicates && error?.code !== 11000) throw error;
}

/**
 * Materializes the regular sessions of [from, to]. Idempotent and safe to run concurrently:
 * - sessions are upserted by occurrenceKey with $setOnInsert, so existing ones are never touched;
 * - sessions created before the redesign (no occurrenceKey) are adopted, not duplicated;
 * - a slot already used by another active session of the group is left alone (unique slotKey).
 */
export async function generateSessions(
  organizationId: string,
  options: { from: string; to: string; classIds?: Array<Types.ObjectId | string> }
) {
  const { from, to } = options;
  if (to < from) throw new AppError(422, "Rango de fechas inválido", "INVALID_DATE_RANGE");
  if (daysBetween(from, to) + 1 > MAX_GENERATION_DAYS) {
    throw new AppError(422, `El rango máximo es de ${MAX_GENERATION_DAYS} días`, "INVALID_DATE_RANGE");
  }

  const classFilter: Record<string, unknown> = { organizationId, status: { $in: SCHEDULABLE_CLASS_STATUSES } };
  if (options.classIds) classFilter._id = { $in: options.classIds.map((id) => new Types.ObjectId(String(id))) };
  const classes = await DanceClassModel.find(classFilter).lean<ClassDoc[]>();
  if (!classes.length) return { created: 0, adopted: 0 };

  await ensureScheduleRules(organizationId, classes);
  const classIds = classes.map((item) => item._id);
  const [rules, holidays] = await Promise.all([
    loadRules(organizationId, { classIds, from, to }),
    HolidayModel.find({ organizationId, date: { $gte: from, $lte: to } }).lean()
  ]);
  const planned = planOccurrences(classes, rules, holidays, from, to);
  if (!planned.length) return { created: 0, adopted: 0 };

  const organizationObjectId = new Types.ObjectId(organizationId);
  const adopted = await adoptLegacySessions(organizationObjectId, planned, from, to);

  const operations = planned.map((item) => {
    const status = item.holiday ? "SUSPENDED" : "SCHEDULED";
    const base = {
      organizationId: organizationObjectId,
      branchId: item.branchId,
      classId: item.classId,
      sessionDate: item.date,
      startTime: item.rule.startTime,
      endTime: item.rule.endTime
    };
    return {
      updateOne: {
        filter: { organizationId: organizationObjectId, occurrenceKey: occurrenceKeyOf(item.rule.seriesId, item.date) },
        update: {
          $setOnInsert: {
            ...base,
            status,
            origin: "REGULAR",
            seriesId: item.rule.seriesId,
            scheduleId: item.rule._id,
            occurrenceDate: item.date,
            occurrenceKey: occurrenceKeyOf(item.rule.seriesId, item.date),
            ...(status === "SCHEDULED" ? { slotKey: slotKeyOf(base) } : {}),
            ...(item.rule.spaceId ? { spaceId: item.rule.spaceId } : {}),
            professorIds: item.rule.professorIds ?? [],
            substitute: false,
            manualOverride: false,
            lockVersion: 0,
            ...(item.holiday
              ? {
                  statusReason: `Feriado: ${item.holiday}`,
                  statusHistory: [{ from: null, to: "SUSPENDED", reason: `Feriado: ${item.holiday}`, at: new Date() }]
                }
              : { statusHistory: [] })
          }
        },
        upsert: true
      }
    };
  });

  let created = 0;
  try {
    const result = await ClassSessionModel.bulkWrite(operations as never, { ordered: false });
    created = result.upsertedCount;
  } catch (error: any) {
    ignoreDuplicateKeyErrors(error);
    created = error?.result?.upsertedCount ?? error?.result?.nUpserted ?? 0;
  }

  return { created, adopted };
}

/** Links sessions created before ClassSchedule existed to the occurrence they represent. */
async function adoptLegacySessions(
  organizationId: Types.ObjectId,
  planned: PlannedOccurrence[],
  from: string,
  to: string
) {
  const legacy = await ClassSessionModel.find({
    organizationId,
    classId: { $in: [...new Set(planned.map((item) => String(item.classId)))] },
    sessionDate: { $gte: from, $lte: to },
    occurrenceKey: { $exists: false },
    origin: { $nin: ["EXTRA", "RESCHEDULED"] }
  })
    .select("_id classId sessionDate startTime status")
    .lean<any[]>();
  if (!legacy.length) return 0;

  const byKey = new Map(legacy.map((item) => [slotKeyOf(item), item]));
  let adopted = 0;
  for (const item of planned) {
    const match = byKey.get(slotKeyOf({ classId: item.classId, sessionDate: item.date, startTime: item.rule.startTime }));
    if (!match) continue;
    byKey.delete(slotKeyOf(match));
    const holdsSlot = ["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(match.status);
    try {
      const result = await ClassSessionModel.updateOne(
        { _id: match._id, occurrenceKey: { $exists: false } },
        {
          $set: {
            origin: "REGULAR",
            seriesId: item.rule.seriesId,
            scheduleId: item.rule._id,
            occurrenceDate: item.date,
            occurrenceKey: occurrenceKeyOf(item.rule.seriesId, item.date),
            ...(holdsSlot ? { slotKey: slotKeyOf(match) } : {}),
            ...(item.rule.spaceId ? { spaceId: item.rule.spaceId } : {})
          }
        }
      );
      adopted += result.modifiedCount;
    } catch (error) {
      ignoreDuplicateKeyErrors(error);
    }
  }
  return adopted;
}

/** Rolling window used by the daily job and by calendar screens. */
export function rollingWindow(today: string, pastDays = 7, futureDays = 60) {
  return { from: addDays(today, -pastDays), to: addDays(today, futureDays) };
}
