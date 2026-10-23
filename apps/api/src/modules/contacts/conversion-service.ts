import { Types, type ClientSession } from "mongoose";
import { academyNow } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { withRequiredTransaction } from "../../common/required-transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel, type DanceClass } from "../classes/class.model";
import { resolveBillingPreference } from "../enrollments/billing-preference";
import { assertSeriesCapacity, currentRules, keysOf, resolveSelection } from "../enrollments/enrollment-capacity";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { newEnrollmentFields, recordBillingChange, reopenEnrollment } from "../enrollments/enrollment-service";
import type { ScheduleRule } from "../scheduling/schedule-service";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { ensureAcademicProfile } from "./contact-service";
import { OpportunityModel } from "./opportunity.model";

type Actor = { organizationId: string; userId: string };
export interface ConversionInput { billingPreference?: "MONTHLY" | "PER_CLASS"; seriesIds?: string[]; scheduleKeys?: string[] }

/** Shared by direct commercial conversion and trial conversion, inside their existing transaction. */
export async function enrollContactInSession(actor: Actor, contactId: string, danceClass: DanceClass & { _id: Types.ObjectId },
  rules: ScheduleRule[], input: ConversionInput, dbSession: ClientSession) {
  const student = await ensureAcademicProfile(actor.organizationId, contactId, dbSession);
  if (!student.branchId.equals(danceClass.branchId)) throw new AppError(422, "La persona y la clase deben pertenecer a la misma sede", "CONTACT_BRANCH_MISMATCH");
  const seriesIds = resolveSelection(rules, input);
  const existing = await EnrollmentModel.findOne({ organizationId: actor.organizationId, classId: danceClass._id, studentId: student._id }).session(dbSession);
  const mode = resolveBillingPreference(danceClass.billingMode, input.billingPreference, existing?.billingPreference);
  if (existing?.status === "ACTIVE") return existing;
  await assertSeriesCapacity(actor.organizationId, danceClass, seriesIds, rules, dbSession, existing?._id);
  const startDate = academyNow().date;
  if (existing) {
    reopenEnrollment(existing, startDate); recordBillingChange(existing, mode, startDate, actor.userId);
    existing.seriesIds = seriesIds; existing.scheduleKeys = keysOf(rules, seriesIds);
    return existing.save({ session: dbSession });
  }
  const [created] = await EnrollmentModel.create([{ organizationId: actor.organizationId, branchId: danceClass.branchId,
    classId: danceClass._id, studentId: student._id, ...newEnrollmentFields({ startDate, billingPreference: mode, userId: actor.userId }),
    seriesIds, scheduleKeys: keysOf(rules, seriesIds) }], { session: dbSession });
  return created;
}

export async function convertContact(actor: Actor, contactId: string, input: ConversionInput & { classId: string }) {
  const preview = await DanceClassModel.findOne({ _id: input.classId, organizationId: actor.organizationId, status: "ACTIVE" });
  if (!preview) throw new AppError(404, "Clase no disponible", "CLASS_NOT_FOUND");
  const rules = await currentRules(actor.organizationId, preview);
  const keys = [`contact:${contactId}`]; await ensureLocks(actor.organizationId, keys);
  return withRequiredTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, keys, dbSession);
    const danceClass = await DanceClassModel.findOne({ _id: input.classId, organizationId: actor.organizationId, status: "ACTIVE" }).session(dbSession);
    if (!danceClass) throw new AppError(404, "Clase no disponible", "CLASS_NOT_FOUND");
    const enrollment = await enrollContactInSession(actor, contactId, danceClass, rules, input, dbSession);
    await OpportunityModel.updateOne({ organizationId: actor.organizationId, contactId, classId: danceClass._id },
      { $set: { status: "CONVERTED", convertedEnrollmentId: enrollment._id } }, { upsert: true, session: dbSession });
    await AuditLogModel.create([{ organizationId: actor.organizationId, actorUserId: actor.userId, action: "CONTACT_CONVERTED_TO_ENROLLMENT",
      entityType: "Contact", entityId: contactId, metadata: { enrollmentId: enrollment._id, classId: danceClass._id } }], { session: dbSession });
    return { enrollment };
  });
}
