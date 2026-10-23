import { Router } from "express";
import { z } from "zod";
import { academyNow } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { studentBalances } from "../billing/balance-service";
import { BranchModel } from "../core/branch.model";
import { ContactModel } from "../contacts/contact.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { CheckInAttemptModel, CheckInCredentialModel, CheckInDeviceModel } from "../check-in/check-in.models";
import { deviceView, opaqueToken, rotateCredential, tokenHash } from "../check-in/credentials-service";
import { objectIdSchema } from "./admin.schemas";

const settings = z.object({ name: z.string().trim().min(2).max(80), beforeMinutes: z.number().int().min(0).max(180).default(45),
  afterMinutes: z.number().int().min(0).max(180).default(20), soundEnabled: z.boolean().default(true), volume: z.number().min(0).max(1).default(0.5) });
const actor = (request: Express.Request) => ({ organizationId: request.auth!.organizationId, userId: request.auth!.userId });
export const adminCheckInRouter = Router();
adminCheckInRouter.get("/devices", async (request, response, next) => {
  try { response.json({ items: (await CheckInDeviceModel.find({ organizationId: request.auth!.organizationId }).sort({ createdAt: -1 })).map(deviceView) }); }
  catch (error) { next(error); }
});
adminCheckInRouter.post("/devices", async (request, response, next) => {
  try {
    const input = settings.extend({ branchId: objectIdSchema }).parse(request.body), organizationId = request.auth!.organizationId;
    if (!await BranchModel.exists({ _id: input.branchId, organizationId, isActive: true })) throw new AppError(422, "Sede no disponible", "INVALID_BRANCH");
    const activationCode = opaqueToken();
    const device = await CheckInDeviceModel.create({ ...input, organizationId, authorizedByUserId: request.auth!.userId,
      activationHash: tokenHash(activationCode), activationExpiresAt: new Date(Date.now() + 10 * 60000) });
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "CHECK_IN_DEVICE_CREATED", entityType: "CheckInDevice", entityId: device._id });
    response.status(201).json({ device: deviceView(device), activationCode });
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
    const id = objectIdSchema.parse(request.params.id), organizationId = request.auth!.organizationId, activationCode = opaqueToken();
    const device = await CheckInDeviceModel.findOneAndUpdate({ _id: id, organizationId }, operation === "revoke"
      ? { $set: { revokedAt: new Date() }, $unset: { sessionHash: 1, activationHash: 1, sessionExpiresAt: 1, activationExpiresAt: 1 } }
      : { $set: { authorizedByUserId: request.auth!.userId, activationHash: tokenHash(activationCode), activationExpiresAt: new Date(Date.now() + 10 * 60000) }, $unset: { revokedAt: 1, sessionHash: 1, sessionExpiresAt: 1 } }, { new: true });
    if (!device) throw new AppError(404, "Dispositivo no encontrado", "DEVICE_NOT_FOUND");
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: operation === "revoke" ? "CHECK_IN_DEVICE_REVOKED" : "CHECK_IN_DEVICE_REACTIVATION", entityType: "CheckInDevice", entityId: device._id });
    response.json({ device: deviceView(device), ...(operation === "activation" ? { activationCode } : {}) });
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
    const organizationId = request.auth!.organizationId, today = academyNow().date;
    const sessions = await ClassSessionModel.find({ organizationId, sessionDate: today }).populate("classId", "name").lean();
    const rows = await ClassAttendanceModel.find({ organizationId, sessionId: { $in: sessions.map((item) => item._id) }, status: "PRESENT" }).sort({ recordedAt: -1 }).lean();
    const contacts = await ContactModel.find({ organizationId, _id: { $in: rows.map((item) => item.studentId) } }).select("firstName lastName").lean();
    const balances = await studentBalances(organizationId, rows.map((item) => item.studentId));
    const reminders = await NotificationLogModel.find({ organizationId, studentId: { $in: rows.map((item) => item.studentId) }, type: "DEBT_REMINDER", status: "SENT" }).select("studentId sentAt").sort({ sentAt: -1 }).lean();
    const attempts = await CheckInAttemptModel.find({ organizationId }).sort({ createdAt: -1 }).limit(30).lean();
    const names = new Map(contacts.map((item) => [String(item._id), `${item.firstName} ${item.lastName}`]));
    const sessionById = new Map(sessions.map((item) => [String(item._id), item]));
    response.json({ date: today, arrivals: rows.map((row) => ({ ...row, personName: names.get(String(row.studentId)) ?? "Alumno histórico",
      session: sessionById.get(String(row.sessionId)), balance: balances.get(String(row.studentId)),
      lastReminderAt: reminders.find((item) => String(item.studentId) === String(row.studentId))?.sentAt })), attempts });
  } catch (error) { next(error); }
});
