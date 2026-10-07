import { Types, type ClientSession } from "mongoose";
import { academyNow } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { DanceClassModel } from "../classes/class.model";
import { ensureScheduleRules, loadRules, ruleCoversDate, slotKey, type ScheduleRule } from "../scheduling/schedule-service";
import { StudentModel } from "../students/student.model";
import { EnrollmentModel } from "./enrollment.model";

/** Series of a group valid today (or the next version when the group starts later). */
export async function currentRules(organizationId: string, danceClass: any) {
  await ensureScheduleRules(organizationId, [danceClass]);
  const today = academyNow().date;
  const rules = await loadRules(organizationId, { classIds: [danceClass._id], from: today });
  const bySeries = new Map<string, ScheduleRule>();
  for (const rule of rules) {
    const key = String(rule.seriesId);
    if (!bySeries.has(key) || ruleCoversDate(rule, today)) bySeries.set(key, rule);
  }
  return [...bySeries.values()];
}

/** Translates the requested selection (series or legacy keys) into series ids of the group. */
export function resolveSelection(rules: ScheduleRule[], input: { seriesIds?: string[]; scheduleKeys?: string[] }) {
  if (input.seriesIds?.length) {
    const valid = new Set(rules.map((rule) => String(rule.seriesId)));
    if (new Set(input.seriesIds).size !== input.seriesIds.length || input.seriesIds.some((id) => !valid.has(id))) {
      throw new AppError(422, "Uno o más horarios seleccionados no pertenecen a la clase", "INVALID_SCHEDULE_SELECTION");
    }
    return input.seriesIds.map((id) => new Types.ObjectId(id));
  }
  if (input.scheduleKeys?.length) {
    const byKey = new Map(rules.map((rule) => [slotKey(rule), rule.seriesId]));
    if (new Set(input.scheduleKeys).size !== input.scheduleKeys.length || input.scheduleKeys.some((key) => !byKey.has(key))) {
      throw new AppError(422, "Uno o más horarios seleccionados no pertenecen a la clase", "INVALID_SCHEDULE_SELECTION");
    }
    return input.scheduleKeys.map((key) => byKey.get(key)!);
  }
  // Without a selection the student attends every slot of the group.
  return rules.map((rule) => rule.seriesId);
}

export function keysOf(rules: ScheduleRule[], seriesIds: Types.ObjectId[]) {
  return rules.filter((rule) => seriesIds.some((id) => id.equals(rule.seriesId))).map(slotKey);
}

/**
 * Capacity per recurring slot, checked inside the transaction after bumping the group's lock:
 * two administrators enrolling the last seat at the same time cannot both succeed. Students who
 * are no longer active never take a seat.
 */
export async function assertSeriesCapacity(
  organizationId: string,
  danceClass: any,
  seriesIds: Types.ObjectId[],
  rules: ScheduleRule[],
  dbSession: ClientSession | undefined,
  excludingEnrollmentId?: Types.ObjectId
) {
  await DanceClassModel.updateOne({ _id: danceClass._id }, { $inc: { lockVersion: 1 } }, { session: dbSession });
  const enrollments = await EnrollmentModel.find({ organizationId, classId: danceClass._id, status: "ACTIVE" })
    .select("_id seriesIds scheduleKeys studentId")
    .session(dbSession ?? null)
    .lean<any[]>();
  const inactive = new Set(
    (
      await StudentModel.find({ organizationId, _id: { $in: enrollments.map((item) => item.studentId) }, isActive: false })
        .select("_id")
        .session(dbSession ?? null)
        .lean<any[]>()
    ).map((item) => String(item._id))
  );
  for (const seriesId of seriesIds) {
    const rule = rules.find((item) => item.seriesId.equals(seriesId));
    const occupied = enrollments.filter(
      (item) =>
        !inactive.has(String(item.studentId)) &&
        (!excludingEnrollmentId || !item._id.equals(excludingEnrollmentId)) &&
        (item.seriesIds?.length
          ? item.seriesIds.some((id: Types.ObjectId) => id.equals(seriesId))
          : !item.scheduleKeys?.length || (rule && item.scheduleKeys.includes(slotKey(rule))))
    ).length;
    if (occupied >= danceClass.capacity) {
      throw new AppError(409, "Uno de los horarios seleccionados no tiene cupo disponible", "SCHEDULE_CAPACITY_REACHED");
    }
  }
}
