import { Types, type ClientSession } from "mongoose";
import type { CheckInResult, CheckInSession } from "@mym/shared";
import { academyNow } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { ContactModel } from "../contacts/contact.model";
import { StudentModel } from "../students/student.model";
import { studentBalances } from "../billing/balance-service";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { isEnrollmentValidOn } from "../enrollments/enrollment-validity";
import { generateSessions } from "../scheduling/session-generator";
import { ClassSessionModel } from "../sessions/class-session.model";
import { attendanceParticipant } from "../sessions/roster-service";
import { setSessionAttendance } from "../sessions/session-service";
import { TrialBookingModel } from "../trials/trial-booking.model";
import { CheckInCredentialModel, CheckInDeviceModel, type DeviceDocument } from "./check-in.models";
import { qrHash, tokenHash } from "./credentials-service";
import { withinCheckInWindow } from "./check-in-window";

/** Credential verification never uses administrative JWTs or a student login. */
export async function authorizedDevice(raw: string | undefined, session?: ClientSession) {
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new AppError(401, "Activá este dispositivo desde recepción", "DEVICE_NOT_AUTHORIZED");
  const device = await CheckInDeviceModel.findOne({ sessionHash: tokenHash(raw), revokedAt: { $exists: false }, sessionExpiresAt: { $gt: new Date() } }).session(session ?? null);
  if (!device) throw new AppError(401, "La autorización del dispositivo venció o fue revocada. Pedí ayuda en recepción.", "DEVICE_NOT_AUTHORIZED");
  return device;
}

async function credentialContact(device: DeviceDocument, qr: string, session?: ClientSession) {
  const credential = await CheckInCredentialModel.findOne({ organizationId: device.organizationId, tokenHash: qrHash(qr), active: true }).session(session ?? null);
  if (!credential) throw new AppError(401, "El QR no está disponible. Pedí ayuda en recepción.", "INVALID_QR");
  const contact = await ContactModel.findOne({ _id: credential.contactId, organizationId: device.organizationId, branchId: device.branchId, isActive: true }).session(session ?? null);
  if (!contact) throw new AppError(422, "No encontramos una asistencia habilitada en esta sede. Consultá en recepción.", "CONTACT_NOT_ELIGIBLE");
  return { credential, contact };
}

async function eligibleParticipant(device: DeviceDocument, session: Parameters<typeof attendanceParticipant>[1], contactId: string, dbSession?: ClientSession) {
  if (!withinCheckInWindow(session, device)) return false;
  const entry = await attendanceParticipant(String(device.organizationId), session, contactId, dbSession);
  if (!entry) return false;
  if (entry.trialId) {
    const trial = await TrialBookingModel.findOne({ _id: entry.trialId, organizationId: device.organizationId, status: { $ne: "CANCELLED" } }).session(dbSession ?? null);
    if (!trial) return false;
  } else {
    const student = await StudentModel.exists({ _id: contactId, organizationId: device.organizationId, branchId: device.branchId, isActive: true }).session(dbSession ?? null);
    if (!student) return false;
    if (entry.enrollmentId) {
      const enrollment = await EnrollmentModel.findOne({ _id: entry.enrollmentId, organizationId: device.organizationId }).session(dbSession ?? null);
      if (!enrollment || !isEnrollmentValidOn(enrollment, session.sessionDate)) return false;
    }
  }
  return true;
}

export async function eligibleSessions(device: DeviceDocument, qr: string) {
  const { contact } = await credentialContact(device, qr);
  const today = academyNow().date;
  // Same generator as the calendar: a kiosk works even before someone opens the day's agenda.
  const classIds = await EnrollmentModel.distinct("classId", { organizationId: device.organizationId, studentId: contact._id });
  if (classIds.length) await generateSessions(String(device.organizationId), { from: today, to: today, classIds });
  const sessions = await ClassSessionModel.find({ organizationId: device.organizationId, branchId: device.branchId, sessionDate: today, status: { $in: ["SCHEDULED", "IN_PROGRESS"] } }).sort({ startTime: 1 });
  const result: CheckInSession[] = [];
  for (const session of sessions) {
    if (!await eligibleParticipant(device, session, String(contact._id))) continue;
    const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId: device.organizationId }).select("name").lean();
    if (danceClass) result.push({ id: String(session._id), name: danceClass.name, startTime: session.startTime, endTime: session.endTime });
  }
  return result;
}

export async function confirmCheckIn(deviceToken: string, qr: string, sessionId: string): Promise<CheckInResult> {
  const device = await authorizedDevice(deviceToken);
  const { contact } = await credentialContact(device, qr);
  const session = await ClassSessionModel.findOne({ _id: sessionId, organizationId: device.organizationId, branchId: device.branchId });
  if (!session) throw new AppError(422, "La sesión no está habilitada en esta sede", "SESSION_NOT_ELIGIBLE");
  const attendance = await setSessionAttendance(String(device.organizationId), session, String(contact._id), "PRESENT", String(device.authorizedByUserId), {
    origin: "KIOSK", deviceId: String(device._id),
    validate: async (current, dbSession) => {
      const latestDevice = await authorizedDevice(deviceToken, dbSession);
      const latest = await credentialContact(latestDevice, qr, dbSession);
      if (!await eligibleParticipant(latestDevice, current, String(latest.contact._id), dbSession)) {
        throw new AppError(422, "Esta sesión no está disponible para tu asistencia en este momento. Consultá en recepción.", "SESSION_NOT_ELIGIBLE");
      }
      // Writes serialize concurrent revocations/settings changes with the attendance transaction.
      await CheckInDeviceModel.updateOne({ _id: latestDevice._id }, { $set: { lastSeenAt: new Date() } }, { session: dbSession });
      await CheckInCredentialModel.updateOne({ _id: latest.credential._id }, { $set: { lastUsedAt: new Date() } }, { session: dbSession });
    }
  });
  let pending = false;
  try {
    const balances = await studentBalances(String(device.organizationId), [contact._id]);
    pending = (balances.get(String(contact._id))?.pendingCents ?? 0) > 0;
  } catch {
    // Persisted attendance remains a success even if the optional financial lookup is unavailable.
  }
  const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId: device.organizationId }).select("name").lean();
  return { kind: attendance.duplicate ? "WARNING" : "SUCCESS", firstName: contact.firstName,
    message: attendance.duplicate ? "Tu asistencia ya estaba registrada." : "Tu asistencia quedó registrada. ¡Que disfrutes la clase!",
    session: { id: String(session._id), name: danceClass?.name ?? "Tu clase", startTime: session.startTime, endTime: session.endTime },
    ...(pending ? { financialNotice: "Tenés un pago pendiente. Podés consultar el detalle de tu cuenta en recepción." } : {}) };
}
