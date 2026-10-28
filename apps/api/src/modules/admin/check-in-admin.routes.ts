import { Router } from "express";
import { z } from "zod";
import { academyNow } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { withRequiredTransaction } from "../../common/required-transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { BranchModel } from "../core/branch.model";
import { DanceClassModel } from "../classes/class.model";
import { ContactModel } from "../contacts/contact.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { isEnrollmentValidOn } from "../enrollments/enrollment-validity";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { CheckInCredentialModel, CheckInDeviceModel } from "../check-in/check-in.models";
import { activationCode, deviceView, rotateCredential, tokenHash } from "../check-in/credentials-service";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { calendarDateSchema, objectIdSchema } from "./admin.schemas";

const settings = z.object({ name: z.string().trim().min(2).max(80), beforeMinutes: z.number().int().min(0).max(180).default(45),
  afterMinutes: z.number().int().min(0).max(180).default(20), soundEnabled: z.boolean().default(true), volume: z.number().min(0).max(1).default(0.5) });
const accessCodeInput = z.object({ branchId: objectIdSchema });
const actor = (request: Express.Request) => ({ organizationId: request.auth!.organizationId, userId: request.auth!.userId });
export const adminCheckInRouter = Router();
adminCheckInRouter.get("/devices", async (request, response, next) => {
  try {
    const devices = await CheckInDeviceModel.find({ organizationId: request.auth!.organizationId })
      .select("+sessionHash +activationHash").sort({ createdAt: -1 });
    response.json({ items: devices.map((device) => ({ ...deviceView(device),
      accessState: device.revokedAt ? "REVOKED" : device.sessionHash ? "ACTIVE" : device.activationHash ? "PENDING" : "INACTIVE"
    })) });
  }
  catch (error) { next(error); }
});
/** A branch has one operational access code. Historical device records are retained only for auditing attendance. */
adminCheckInRouter.post("/access-code", async (request, response, next) => {
  try {
    const { branchId } = accessCodeInput.parse(request.body), organizationId = request.auth!.organizationId;
    const branch = await BranchModel.findOne({ _id: branchId, organizationId, isActive: true }).select("name").lean();
    if (!branch) throw new AppError(422, "Sede no disponible", "INVALID_BRANCH");
    const code = activationCode(), keys = [`check-in-branch:${branchId}`];
    await ensureLocks(organizationId, keys);
    const device = await withRequiredTransaction(async (session) => {
      await touchLocks(organizationId, keys, session);
      await CheckInDeviceModel.updateMany({ organizationId, branchId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() }, $unset: { sessionHash: 1, sessionExpiresAt: 1, activationHash: 1, activationExpiresAt: 1 } }, { session });
      const [device] = await CheckInDeviceModel.create([{ organizationId, branchId, name: `Registro de asistencia ${branch.name}`.slice(0, 80),
        authorizedByUserId: request.auth!.userId, activationHash: tokenHash(code), soundEnabled: true, volume: 0.5 }], { session });
      await AuditLogModel.create([{ organizationId, actorUserId: request.auth!.userId, action: "CHECK_IN_ACCESS_CODE_ISSUED", entityType: "CheckInDevice", entityId: device._id }], { session });
      return device;
    });
    response.status(201).json({ activationCode: code, branchId: String(branchId), deviceId: String(device._id) });
  } catch (error) { next(error); }
});
adminCheckInRouter.post("/access-code/revoke", async (request, response, next) => {
  try {
    const { branchId } = accessCodeInput.parse(request.body), organizationId = request.auth!.organizationId;
    if (!await BranchModel.exists({ _id: branchId, organizationId })) throw new AppError(422, "Sede no disponible", "INVALID_BRANCH");
    const keys = [`check-in-branch:${branchId}`];
    await ensureLocks(organizationId, keys);
    await withRequiredTransaction(async (session) => {
      await touchLocks(organizationId, keys, session);
      const result = await CheckInDeviceModel.updateMany({ organizationId, branchId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() }, $unset: { sessionHash: 1, sessionExpiresAt: 1, activationHash: 1, activationExpiresAt: 1 } }, { session });
      await AuditLogModel.create([{ organizationId, actorUserId: request.auth!.userId, action: "CHECK_IN_ACCESS_CODE_REVOKED", entityType: "CheckInDevice", metadata: { branchId, affectedDevices: result.modifiedCount } }], { session });
    });
    response.status(204).send();
  } catch (error) { next(error); }
});
adminCheckInRouter.post("/devices", async (request, response, next) => {
  try {
    const input = settings.extend({ branchId: objectIdSchema }).parse(request.body), organizationId = request.auth!.organizationId;
    if (!await BranchModel.exists({ _id: input.branchId, organizationId, isActive: true })) throw new AppError(422, "Sede no disponible", "INVALID_BRANCH");
    const code = activationCode();
    const device = await CheckInDeviceModel.create({ ...input, organizationId, authorizedByUserId: request.auth!.userId,
      activationHash: tokenHash(code) });
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "CHECK_IN_DEVICE_CREATED", entityType: "CheckInDevice", entityId: device._id });
    response.status(201).json({ device: deviceView(device), activationCode: code });
  } catch (error) { next(error); }
});
adminCheckInRouter.patch("/devices/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id), parsed = settings.partial().parse(request.body);
    const input = Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.hasOwn(request.body, key)));
    const device = await CheckInDeviceModel.findOneAndUpdate({ _id: id, organizationId: request.auth!.organizationId }, { $set: input }, { new: true });
    if (!device) throw new AppError(404, "Dispositivo no encontrado", "DEVICE_NOT_FOUND");
    await AuditLogModel.create({ organizationId: request.auth!.organizationId, actorUserId: request.auth!.userId, action: "CHECK_IN_DEVICE_UPDATED", entityType: "CheckInDevice", entityId: device._id, metadata: { changedFields: Object.keys(input) } });
    response.json(deviceView(device));
  } catch (error) { next(error); }
});
for (const operation of ["activation", "revoke"] as const) adminCheckInRouter.post(`/devices/:id/${operation}`, async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id), organizationId = request.auth!.organizationId, code = activationCode();
    const device = await CheckInDeviceModel.findOneAndUpdate({ _id: id, organizationId }, operation === "revoke"
      ? { $set: { revokedAt: new Date() }, $unset: { sessionHash: 1, activationHash: 1, sessionExpiresAt: 1, activationExpiresAt: 1 } }
      : { $set: { authorizedByUserId: request.auth!.userId, activationHash: tokenHash(code) }, $unset: { revokedAt: 1, sessionHash: 1, sessionExpiresAt: 1, activationExpiresAt: 1 } }, { new: true });
    if (!device) throw new AppError(404, "Dispositivo no encontrado", "DEVICE_NOT_FOUND");
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: operation === "revoke" ? "CHECK_IN_DEVICE_REVOKED" : "CHECK_IN_DEVICE_REACTIVATION", entityType: "CheckInDevice", entityId: device._id });
    response.json({ device: deviceView(device), ...(operation === "activation" ? { activationCode: code } : {}) });
  } catch (error) { next(error); }
});
adminCheckInRouter.get("/contacts/:id/credential", async (request, response, next) => {
  try {
    const credential = await CheckInCredentialModel.findOne({ organizationId: request.auth!.organizationId, contactId: objectIdSchema.parse(request.params.id), active: true }).select("createdAt lastUsedAt");
    response.json({ active: Boolean(credential), issuedAt: credential?.get("createdAt"), lastUsedAt: credential?.lastUsedAt });
  } catch (error) { next(error); }
});
for (const operation of ["rotate", "revoke"] as const) adminCheckInRouter.post(`/contacts/:id/credential/${operation}`, async (request, response, next) => {
  try { response.setHeader("Cache-Control", "no-store, private"); response.json(await rotateCredential(actor(request), objectIdSchema.parse(request.params.id), operation === "revoke")); }
  catch (error) { next(error); }
});

adminCheckInRouter.get("/reception", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const { date } = z.object({ date: calendarDateSchema.optional() }).parse(request.query);
    const selectedDate = date ?? academyNow().date;
    const sessions = await ClassSessionModel.find({ organizationId, sessionDate: selectedDate }).populate("classId", "name").lean();
    const sessionIds = sessions.map((item) => item._id);
    const sessionClassId = (session: typeof sessions[number]) => {
      const classId = session.classId as unknown;
      return String(typeof classId === "object" && classId !== null && "_id" in classId ? classId._id : classId);
    };
    const classIds = [...new Set(sessions.map(sessionClassId))];
    const [rows, danceClasses, enrollments] = await Promise.all([
      ClassAttendanceModel.find({ organizationId, sessionId: { $in: sessionIds }, status: "PRESENT" }).sort({ recordedAt: -1 }).lean(),
      DanceClassModel.find({ organizationId, _id: { $in: classIds } }).select("name capacity").lean(),
      EnrollmentModel.find({ organizationId, classId: { $in: classIds } }).select("classId status enrolledAt endedAt periods").lean()
    ]);
    const contacts = await ContactModel.find({ organizationId, _id: { $in: rows.map((item) => item.studentId) } }).select("firstName lastName").lean();
    const names = new Map(contacts.map((item) => [String(item._id), `${item.firstName} ${item.lastName}`]));
    const sessionById = new Map(sessions.map((item) => [String(item._id), item]));
    const classes = danceClasses.map((danceClass) => {
      const classId = String(danceClass._id);
      const classSessionIds = new Set(sessions.filter((session) => sessionClassId(session) === classId).map((session) => String(session._id)));
      return {
        id: classId,
        name: danceClass.name,
        capacity: danceClass.capacity,
        enrolled: enrollments.filter((enrollment) => String(enrollment.classId) === classId && isEnrollmentValidOn(enrollment, selectedDate)).length,
        attendance: rows.filter((row) => classSessionIds.has(String(row.sessionId))).length
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
    response.json({ date: selectedDate, classes, arrivals: rows.map((row) => ({ ...row, personName: names.get(String(row.studentId)) ?? "Alumno histórico",
      session: sessionById.get(String(row.sessionId)) })) });
  } catch (error) { next(error); }
});
