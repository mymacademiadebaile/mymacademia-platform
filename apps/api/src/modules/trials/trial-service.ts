import { Types, type ClientSession } from "mongoose";
import { academyInstant, academyNow } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { withRequiredTransaction } from "../../common/required-transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { resolveContact } from "../contacts/contact-service";
import { OpportunityModel } from "../contacts/opportunity.model";
import { enrollContactInSession } from "../contacts/conversion-service";
import { currentRules } from "../enrollments/enrollment-capacity";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { assertSeatAvailable, loadRoster, sessionLockKey } from "../sessions/roster-service";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { TrialBenefitModel } from "./trial-benefit.model";
import { TrialBookingModel } from "./trial-booking.model";
import { ChargeModel } from "../billing/charge.model";

type Actor = { organizationId: string; userId: string };
export const trialLockKey = (contactId: unknown, classId: unknown) => `trial:${String(contactId)}:${String(classId)}`;

async function audit(actor: Actor, action: string, entityId: Types.ObjectId, metadata: Record<string, unknown>, session: ClientSession) {
  await AuditLogModel.create([{ organizationId: actor.organizationId, actorUserId: actor.userId,
    action, entityType: "TrialBooking", entityId, metadata }], { session });
}

export async function bookTrial(actor: Actor, input: { contactId: string; sessionId: string; kind?: "TRIAL" | "COURTESY"; notes?: string }) {
  const target = await ClassSessionModel.findOne({ _id: input.sessionId, organizationId: actor.organizationId }).lean();
  if (!target) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  const keys = [sessionLockKey(target._id), trialLockKey(input.contactId, target.classId)];
  await ensureLocks(actor.organizationId, keys);
  return withRequiredTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, keys, dbSession);
    const session = await ClassSessionModel.findOne({ _id: target._id, organizationId: actor.organizationId }).session(dbSession);
    if (!session || !["SCHEDULED", "IN_PROGRESS"].includes(session.status) || session.sessionDate < academyNow().date ||
      (session.sessionDate === academyNow().date && session.endTime <= academyNow().time)) {
      throw new AppError(422, "La sesión no está disponible", "SESSION_UNAVAILABLE");
    }
    const contact = await resolveContact(actor.organizationId, input.contactId, dbSession);
    if (!contact.isActive || !contact.branchId.equals(session.branchId)) throw new AppError(422, "El contacto no está disponible en esta sede", "CONTACT_BRANCH_MISMATCH");
    const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId: actor.organizationId, status: "ACTIVE" }).session(dbSession);
    if (!danceClass) throw new AppError(404, "Clase no disponible", "CLASS_NOT_FOUND");
    const kind = input.kind ?? "TRIAL";
    if (kind === "TRIAL" && !danceClass.freeTrialEnabled) throw new AppError(422, "Esta clase no admite prueba gratuita", "FREE_TRIAL_NOT_ENABLED");
    if (kind === "COURTESY" && !input.notes?.trim()) throw new AppError(422, "Indicá el motivo de la cortesía", "REASON_REQUIRED");
    const roster = await loadRoster(actor.organizationId, session, { dbSession });
    const existing = roster.find((entry) => entry.studentId === String(contact._id));
    if (existing && !(kind === "COURTESY" && existing.participantType === "ENROLLMENT" && existing.attendanceStatus !== "PRESENT")) {
      throw new AppError(409, "La persona ya está en la lista de esta sesión", "ALREADY_IN_SESSION");
    }
    if (kind === "COURTESY" && await ChargeModel.exists({ organizationId: actor.organizationId, studentId: contact._id, classId: session.classId,
      kind: "CLASS_FEE", status: { $ne: "VOID" }, $or: [{ sessionId: session._id }, { sessionId: { $exists: false }, serviceDate: session.sessionDate }] }).session(dbSession)) {
      throw new AppError(409, "La clase ya tiene un cargo; revisalo en la cuenta corriente antes de otorgar una cortesía", "COURTESY_REQUIRES_FINANCIAL_REVIEW");
    }
    await assertSeatAvailable(actor.organizationId, session, danceClass.capacity, dbSession, String(contact._id));
    let benefit;
    if (kind === "TRIAL") {
      // Legacy history without a benefit record is still authoritative and cannot reopen a trial.
      const history = await TrialBookingModel.find({ organizationId: actor.organizationId, classId: session.classId,
        studentId: contact._id, kind: { $ne: "COURTESY" }, status: { $ne: "CANCELLED" } }).session(dbSession);
      if (history.some((item) => item.consumedAt || item.status === "COMPLETED" || item.status === "CONVERTED")) {
        throw new AppError(409, "Esta persona ya utilizó una prueba o tiene un historial que requiere revisión", "TRIAL_CONSUMED");
      }
      if (history.some((item) => item.status === "SCHEDULED")) throw new AppError(409, "Ya hay una prueba reservada para este grupo", "TRIAL_ALREADY_SCHEDULED");
      benefit = await TrialBenefitModel.findOneAndUpdate({ organizationId: actor.organizationId, contactId: contact._id, classId: session.classId },
        { $setOnInsert: { organizationId: actor.organizationId, contactId: contact._id, classId: session.classId } },
        { upsert: true, new: true, session: dbSession });
      if (benefit.consumedAt) throw new AppError(409, "La prueba gratuita de este grupo ya fue utilizada", "TRIAL_CONSUMED");
      if (benefit.activeBookingId) throw new AppError(409, "Ya hay una prueba reservada para este grupo", "TRIAL_ALREADY_SCHEDULED");
    }
    const [booking] = await TrialBookingModel.create([{
      organizationId: actor.organizationId, branchId: session.branchId, classId: session.classId,
      contactId: contact._id, studentId: contact._id, sessionId: session._id, scheduledFor: academyInstant(session.sessionDate, session.startTime),
      kind, status: "SCHEDULED", notes: input.notes, authorizedByUserId: actor.userId
    }], { session: dbSession });
    if (benefit) { benefit.activeBookingId = booking._id; await benefit.save({ session: dbSession }); }
    await ClassAttendanceModel.findOneAndUpdate({ organizationId: actor.organizationId, sessionId: session._id, studentId: contact._id }, {
      $set: { contactId: contact._id, participantType: kind, trialId: booking._id, status: "EXPECTED",
        addedByUserId: actor.userId, note: input.notes }, $unset: { removedAt: 1 }
    }, { upsert: true, new: true, session: dbSession });
    await OpportunityModel.updateOne({ organizationId: actor.organizationId, contactId: contact._id, classId: session.classId }, {
      $set: { status: "TRIAL_BOOKED" }, $setOnInsert: { organizationId: actor.organizationId, contactId: contact._id, classId: session.classId }
    }, { upsert: true, session: dbSession });
    await audit(actor, kind === "COURTESY" ? "COURTESY_AUTHORIZED" : "TRIAL_BOOKED", booking._id, { contactId: contact._id, sessionId: session._id, reason: input.notes }, dbSession);
    return booking;
  });
}

/** Called only inside the common attendance transaction. Correcting attendance never restores consumption. */
export async function settleTrialAttendance(organizationId: string, trialId: string, sessionId: Types.ObjectId, status: string, dbSession: ClientSession) {
  const trial = await TrialBookingModel.findOne({ _id: trialId, organizationId }).session(dbSession);
  if (!trial || trial.status === "CANCELLED") throw new AppError(409, "La reserva ya no está disponible", "TRIAL_UNAVAILABLE");
  if (status === "PRESENT") {
    if (trial.kind !== "COURTESY") {
      const otherPresent = await ClassAttendanceModel.exists({ organizationId, trialId: trial._id, status: "PRESENT", sessionId: { $ne: sessionId } }).session(dbSession);
      if (otherPresent) throw new AppError(409, "La prueba ya fue utilizada en otra sesión", "TRIAL_CONSUMED");
      const benefit = await TrialBenefitModel.findOneAndUpdate({ organizationId, contactId: trial.contactId ?? trial.studentId, classId: trial.classId },
        { $setOnInsert: { organizationId, contactId: trial.contactId ?? trial.studentId, classId: trial.classId } },
        { upsert: true, new: true, session: dbSession });
      if (benefit.consumedBookingId && !benefit.consumedBookingId.equals(trial._id)) throw new AppError(409, "La prueba gratuita de este grupo ya fue utilizada", "TRIAL_CONSUMED");
      // Check old endpoints/history too, even before the additive migration has run.
      const oldConsumption = await TrialBookingModel.exists({ organizationId, studentId: trial.studentId, classId: trial.classId,
        _id: { $ne: trial._id }, kind: { $ne: "COURTESY" }, $or: [{ consumedAt: { $exists: true } }, { status: "COMPLETED" }] }).session(dbSession);
      if (oldConsumption) throw new AppError(409, "La prueba gratuita de este grupo ya fue utilizada", "TRIAL_CONSUMED");
      benefit.consumedBookingId = trial._id;
      benefit.consumedAt ??= new Date();
      benefit.activeBookingId = undefined;
      await benefit.save({ session: dbSession });
    }
    trial.consumedAt ??= new Date();
    trial.status = trial.convertedEnrollmentId ? "CONVERTED" : "COMPLETED";
  } else if (status === "ABSENT" && !trial.consumedAt) {
    trial.status = "CANCELLED";
    await TrialBenefitModel.updateOne({ organizationId, activeBookingId: trial._id }, { $unset: { activeBookingId: 1 } }, { session: dbSession });
  }
  await trial.save({ session: dbSession });
}

export async function cancelTrial(actor: Actor, id: string) {
  const target = await TrialBookingModel.findOne({ _id: id, organizationId: actor.organizationId }).lean();
  if (!target) throw new AppError(404, "Prueba no encontrada", "TRIAL_NOT_FOUND");
  const keys = [trialLockKey(target.studentId, target.classId), ...(target.sessionId ? [sessionLockKey(target.sessionId)] : [])];
  await ensureLocks(actor.organizationId, keys);
  return withRequiredTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, keys, dbSession);
    const trial = await TrialBookingModel.findOne({ _id: id, organizationId: actor.organizationId }).session(dbSession);
    if (!trial) throw new AppError(404, "Prueba no encontrada", "TRIAL_NOT_FOUND");
    const present = await ClassAttendanceModel.exists({ organizationId: actor.organizationId, trialId: trial._id, status: "PRESENT" }).session(dbSession);
    if (trial.consumedAt || present || trial.status === "COMPLETED") throw new AppError(409, "La asistencia ya consumió esta clase; requiere una corrección administrativa", "TRIAL_CONSUMED");
    trial.status = "CANCELLED";
    await trial.save({ session: dbSession });
    await TrialBenefitModel.updateOne({ organizationId: actor.organizationId, activeBookingId: trial._id }, { $unset: { activeBookingId: 1 } }, { session: dbSession });
    await ClassAttendanceModel.updateMany({ organizationId: actor.organizationId, trialId: trial._id, status: { $ne: "PRESENT" } },
      { $set: { removedAt: new Date() } }, { session: dbSession });
    await audit(actor, "TRIAL_CANCELLED", trial._id, {}, dbSession);
    return trial;
  });
}

export async function convertTrial(actor: Actor, id: string, input: { billingPreference?: "MONTHLY" | "PER_CLASS"; seriesIds?: string[]; scheduleKeys?: string[] }) {
  const target = await TrialBookingModel.findOne({ _id: id, organizationId: actor.organizationId });
  if (!target) throw new AppError(404, "Prueba no encontrada", "TRIAL_NOT_FOUND");
  const danceClass = await DanceClassModel.findOne({ _id: target.classId, organizationId: actor.organizationId, status: "ACTIVE" });
  if (!danceClass) throw new AppError(404, "Clase no disponible", "CLASS_NOT_FOUND");
  const rules = await currentRules(actor.organizationId, danceClass);
  const keys = [trialLockKey(target.studentId, target.classId), `contact:${String(target.studentId)}`];
  await ensureLocks(actor.organizationId, keys);
  return withRequiredTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, keys, dbSession);
    const trial = await TrialBookingModel.findOne({ _id: id, organizationId: actor.organizationId }).session(dbSession);
    if (!trial || trial.status === "CANCELLED") throw new AppError(409, "La prueba no se puede convertir", "TRIAL_NOT_CONVERTIBLE");
    if (trial.convertedEnrollmentId) {
      const enrollment = await EnrollmentModel.findOne({ _id: trial.convertedEnrollmentId, organizationId: actor.organizationId }).session(dbSession);
      if (!enrollment) throw new AppError(409, "La conversión requiere revisión", "ENROLLMENT_NOT_FOUND");
      return { trial, enrollment };
    }
    const enrollment = await enrollContactInSession(actor, String(trial.contactId ?? trial.studentId), danceClass, rules, input, dbSession);
    const studentId = enrollment.studentId;
    trial.contactId = studentId; trial.convertedEnrollmentId = enrollment!._id; trial.status = "CONVERTED";
    await trial.save({ session: dbSession });
    await OpportunityModel.updateOne({ organizationId: actor.organizationId, contactId: studentId, classId: trial.classId },
      { $set: { status: "CONVERTED", convertedEnrollmentId: enrollment!._id } }, { session: dbSession });
    await audit(actor, "TRIAL_CONVERTED_TO_ENROLLMENT", trial._id, { contactId: studentId, enrollmentId: enrollment!._id }, dbSession);
    return { trial, enrollment: enrollment! };
  });
}
