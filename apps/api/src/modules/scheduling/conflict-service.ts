import { Types, type ClientSession } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { DanceClassModel } from "../classes/class.model";
import { ClassSessionModel, SLOT_HOLDING_STATUSES } from "../sessions/class-session.model";
import { ClassScheduleModel } from "./class-schedule.model";
import { DanceSpaceModel } from "./dance-space.model";
import { rangesOverlap } from "./schedule-service";

export interface ConflictCandidate {
  date: string;
  startTime: string;
  endTime: string;
  spaceId?: Types.ObjectId | string | null;
  /** Professors teaching. Pass the group's professors when the session has none of its own. */
  professorIds: Array<Types.ObjectId | string>;
  excludeSessionIds?: Array<Types.ObjectId | string>;
}

export interface Conflict {
  kind: "SPACE" | "PROFESSOR";
  sessionId?: string;
  seriesId?: string;
  className: string;
  date?: string;
  day?: string;
  startTime: string;
  endTime: string;
}

function timesOverlap(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

const ids = (values: Array<Types.ObjectId | string> = []) => new Set(values.map(String));

/** Lock key that serializes every calendar write of one organization and day. */
export function calendarLockKey(date: string) {
  return `calendar:${date}`;
}

/** Lock key that serializes recurring rule changes of one organization. */
export const RULES_LOCK_KEY = "schedule-rules";

/** Space and professor conflicts of a concrete session against the sessions of that day. */
export async function findSessionConflicts(
  organizationId: string,
  candidate: ConflictCandidate,
  session?: ClientSession
): Promise<Conflict[]> {
  const sameDay = await ClassSessionModel.find({
    organizationId,
    sessionDate: candidate.date,
    status: { $in: SLOT_HOLDING_STATUSES },
    _id: { $nin: (candidate.excludeSessionIds ?? []).map((id) => new Types.ObjectId(String(id))) }
  })
    .session(session ?? null)
    .lean<any[]>();

  const overlapping = sameDay.filter((item) => timesOverlap(item, candidate));
  if (!overlapping.length) return [];

  const classes = await DanceClassModel.find({
    organizationId,
    _id: { $in: [...new Set(overlapping.map((item) => String(item.classId)))] }
  })
    .select("name professorIds")
    .session(session ?? null)
    .lean<any[]>();
  const classById = new Map(classes.map((item) => [String(item._id), item]));
  const wanted = ids(candidate.professorIds);
  const conflicts: Conflict[] = [];

  for (const item of overlapping) {
    const danceClass = classById.get(String(item.classId));
    const base = {
      sessionId: String(item._id),
      className: danceClass?.name ?? "Otra clase",
      date: item.sessionDate,
      startTime: item.startTime,
      endTime: item.endTime
    };
    if (candidate.spaceId && item.spaceId && String(item.spaceId) === String(candidate.spaceId)) {
      conflicts.push({ kind: "SPACE", ...base });
    }
    const teaching = item.professorIds?.length ? item.professorIds : danceClass?.professorIds ?? [];
    if (teaching.some((id: Types.ObjectId) => wanted.has(String(id)))) {
      conflicts.push({ kind: "PROFESSOR", ...base });
    }
  }

  return conflicts;
}

export interface RuleCandidate {
  day: string;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo?: string;
  spaceId?: Types.ObjectId | string | null;
  professorIds: Array<Types.ObjectId | string>;
  excludeSeriesIds?: Array<Types.ObjectId | string>;
  excludeClassId?: Types.ObjectId | string;
}

/** Space and professor conflicts of a recurring rule against the other groups' rules. */
export async function findRuleConflicts(
  organizationId: string,
  candidate: RuleCandidate,
  session?: ClientSession
): Promise<Conflict[]> {
  const rules = await ClassScheduleModel.find({
    organizationId,
    day: candidate.day,
    seriesId: { $nin: (candidate.excludeSeriesIds ?? []).map((id) => new Types.ObjectId(String(id))) },
    validFrom: { $lte: candidate.validTo ?? "9999-12-31" },
    $or: [{ validTo: { $exists: false } }, { validTo: null }, { validTo: { $gte: candidate.validFrom } }]
  })
    .session(session ?? null)
    .lean<any[]>();

  const overlapping = rules.filter((rule) => timesOverlap(rule, candidate) && rangesOverlap(rule, candidate));
  if (!overlapping.length) return [];

  const classes = await DanceClassModel.find({
    organizationId,
    _id: { $in: [...new Set(overlapping.map((item) => String(item.classId)))] },
    status: { $nin: ["ARCHIVED", "INACTIVE"] }
  })
    .select("name professorIds")
    .session(session ?? null)
    .lean<any[]>();
  const classById = new Map(classes.map((item) => [String(item._id), item]));
  const wanted = ids(candidate.professorIds);
  const conflicts: Conflict[] = [];

  for (const rule of overlapping) {
    const danceClass = classById.get(String(rule.classId));
    if (!danceClass) continue;
    const base = {
      seriesId: String(rule.seriesId),
      className: danceClass.name,
      day: rule.day,
      startTime: rule.startTime,
      endTime: rule.endTime
    };
    if (candidate.spaceId && rule.spaceId && String(rule.spaceId) === String(candidate.spaceId)) {
      conflicts.push({ kind: "SPACE", ...base });
    }
    // A group never conflicts with itself through its shared professors (its own slots are
    // validated as overlapping times instead).
    if (candidate.excludeClassId && String(rule.classId) === String(candidate.excludeClassId)) continue;
    const teaching = rule.professorIds?.length ? rule.professorIds : danceClass.professorIds ?? [];
    if (teaching.some((id: Types.ObjectId) => wanted.has(String(id)))) {
      conflicts.push({ kind: "PROFESSOR", ...base });
    }
  }

  return conflicts;
}

/** Turns conflicts into a 409 the UI can explain. */
export function assertNoConflicts(conflicts: Conflict[]) {
  if (!conflicts.length) return;
  const first = conflicts[0];
  const when = first.date ? `${first.date} ` : first.day ? `${dayLabel(first.day)} ` : "";
  const message =
    first.kind === "SPACE"
      ? `La pista está ocupada por "${first.className}" (${when}${first.startTime}-${first.endTime})`
      : `El profesor ya dicta "${first.className}" en ese horario (${when}${first.startTime}-${first.endTime})`;
  throw new AppError(409, message, first.kind === "SPACE" ? "SPACE_CONFLICT" : "PROFESSOR_CONFLICT", conflicts);
}

function dayLabel(day: string) {
  return (
    {
      MONDAY: "lunes",
      TUESDAY: "martes",
      WEDNESDAY: "miércoles",
      THURSDAY: "jueves",
      FRIDAY: "viernes",
      SATURDAY: "sábado",
      SUNDAY: "domingo"
    } as Record<string, string>
  )[day] ?? day;
}

/** The space must exist, be usable and belong to the branch of the group. */
export async function assertUsableSpace(
  organizationId: string,
  spaceId: string | Types.ObjectId | null | undefined,
  branchId: Types.ObjectId,
  session?: ClientSession
) {
  if (!spaceId) return undefined;
  const space = await DanceSpaceModel.findOne({ _id: spaceId, organizationId }).session(session ?? null).lean<any>();
  if (!space || space.status !== "ACTIVE") {
    throw new AppError(422, "La pista seleccionada no está disponible", "INVALID_SPACE");
  }
  if (!space.branchId.equals(branchId)) {
    throw new AppError(422, "La pista pertenece a otra sede", "SPACE_BRANCH_MISMATCH");
  }
  return space;
}
