import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError } from "../../common/http/app-error";
import { authorizedDevice, confirmCheckIn, eligibleSessions } from "./check-in-service";
import { CheckInAttemptModel, CheckInDeviceModel, type DeviceDocument } from "./check-in.models";
import { deviceView, opaqueToken, tokenHash } from "./credentials-service";
import { objectIdSchema } from "../admin/admin.schemas";
import { withRequiredTransaction } from "../../common/required-transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import { UserModel } from "../auth/user.model";
import { BranchModel } from "../core/branch.model";
import { isTrustedAppOrigin } from "../../common/app-origin";
import { dniSchema } from "../../common/dni";

export const DEVICE_COOKIE = "mym_kiosk";
export const checkInRouter = Router();
checkInRouter.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store, private"); next(); });
checkInRouter.use((request, _response, next) => {
  if (request.method !== "GET" && request.headers.origin && !isTrustedAppOrigin(request.headers.origin, env.APP_ORIGIN)) {
    next(new AppError(403, "El origen de la solicitud no está autorizado", "INVALID_ORIGIN")); return;
  }
  next();
});
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/check-in" };

// An admin login is sufficient to open attendance registration; no device code is required.
checkInRouter.post("/authorize", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (request, response, next) => {
  try {
    const { organizationId, userId } = request.auth!;
    if (!await UserModel.exists({ _id: userId, organizationId, role: { $in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true })) {
      throw new AppError(401, "Iniciá sesión con una cuenta de administrador", "AUTH_REQUIRED");
    }
    const { branchId } = z.object({ branchId: objectIdSchema.optional() }).parse(request.body ?? {});
    const branches = await BranchModel.find({ organizationId, isActive: true }).select("name").sort({ createdAt: 1, _id: 1 }).lean();
    if (!branches.length) throw new AppError(422, "No hay una sede activa para registrar asistencias", "INVALID_BRANCH");
    if (!branchId && branches.length > 1) throw new AppError(409, "Elegí la sede donde vas a registrar las asistencias", "KIOSK_BRANCH_REQUIRED", { branches: branches.map((branch) => ({ id: String(branch._id), name: branch.name })) });
    const branch = branches.find((item) => String(item._id) === (branchId ?? String(branches[0]._id)));
    if (!branch) throw new AppError(422, "Sede no disponible", "INVALID_BRANCH");
    const previous = request.cookies?.[DEVICE_COOKIE] as string | undefined;
    const raw = opaqueToken(), expires = new Date(Date.now() + 8 * 60 * 60000);
    const device = await withRequiredTransaction(async (session) => {
      const existing = previous && /^[A-Za-z0-9_-]{43}$/.test(previous)
        ? await CheckInDeviceModel.findOne({ organizationId, branchId: branch._id, sessionHash: tokenHash(previous), revokedAt: { $exists: false } }).session(session)
        : null;
      const device = existing ?? new CheckInDeviceModel({ organizationId, branchId: branch._id, name: `Asistencia ${branch.name}`.slice(0, 80) });
      device.set({ authorizedByUserId: userId, sessionHash: tokenHash(raw), sessionExpiresAt: expires, activatedAt: new Date() });
      await device.save({ session });
      await AuditLogModel.create([{ organizationId, actorUserId: userId, action: "CHECK_IN_AUTHORIZED_BY_ADMIN_LOGIN", entityType: "CheckInDevice", entityId: device._id }], { session });
      return device;
    });
    response.cookie(DEVICE_COOKIE, raw, { ...cookieOptions, expires });
    response.json(deviceView(device));
  } catch (error) { next(error); }
});

export const activationRateLimiter = rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "Esperá unos minutos antes de intentar activar nuevamente", error: "ACTIVATION_RATE_LIMIT" } });
checkInRouter.post("/activate", activationRateLimiter, async (request, response, next) => {
  try {
    const { code } = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(request.body);
    const raw = opaqueToken(), expires = new Date(Date.now() + 8 * 60 * 60000);
    const device = await withRequiredTransaction(async (session) => {
      const device = await CheckInDeviceModel.findOneAndUpdate({ activationHash: tokenHash(code), activationExpiresAt: { $gt: new Date() }, revokedAt: { $exists: false } },
        { $set: { sessionHash: tokenHash(raw), sessionExpiresAt: expires, activatedAt: new Date() }, $unset: { activationHash: 1, activationExpiresAt: 1 } }, { new: true, session });
      if (!device) throw new AppError(401, "El código venció o ya fue utilizado. Solicitá uno nuevo en recepción.", "INVALID_ACTIVATION_CODE");
      await AuditLogModel.create([{ organizationId: device.organizationId, actorUserId: device.authorizedByUserId,
        action: "CHECK_IN_DEVICE_ACTIVATED", entityType: "CheckInDevice", entityId: device._id }], { session });
      return device;
    });
    response.cookie(DEVICE_COOKIE, raw, { ...cookieOptions, expires });
    for (const name of ["mym_access", "mym_refresh"]) response.clearCookie(name, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    response.json(deviceView(device));
  } catch (error) { next(error); }
});
checkInRouter.use(async (request, response, next) => {
  try { response.locals.device = await authorizedDevice(request.cookies?.[DEVICE_COOKIE]); next(); }
  catch (error) { next(error); }
});
checkInRouter.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: (_request, response) => String((response.locals.device as DeviceDocument)._id),
  standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Esperá un momento antes de volver a registrar la asistencia", error: "CHECK_IN_RATE_LIMIT" } }));
checkInRouter.get("/device", (_request, response) => {
  response.json(deviceView(response.locals.device as DeviceDocument));
});
checkInRouter.post("/logout", async (_request, response, next) => {
  try {
    const device = response.locals.device as DeviceDocument;
    await CheckInDeviceModel.updateOne({ _id: device._id }, { $unset: { sessionHash: 1, sessionExpiresAt: 1 } });
    response.clearCookie(DEVICE_COOKIE, cookieOptions); response.status(204).send();
  } catch (error) { next(error); }
});
const scanSchema = z.object({ qr: z.string().min(1).max(80).optional(), dni: dniSchema.optional(), sessionId: objectIdSchema.optional() }).strict()
  .refine((input) => Boolean(input.qr) !== Boolean(input.dni), "Elegí QR o DNI para registrar la asistencia");
export const dniRateLimiter = rateLimit({ windowMs: 60000, limit: 20, keyGenerator: (_request, response) => String((response.locals.device as DeviceDocument)._id),
  standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Esperá un momento antes de volver a ingresar el DNI, o pedí ayuda en recepción", error: "DNI_RATE_LIMIT" } });
checkInRouter.use(["/scan", "/present"], (request, response, next) => request.body?.dni !== undefined ? dniRateLimiter(request, response, next) : next());
for (const route of ["scan", "present"] as const) checkInRouter.post(`/${route}`, async (request, response, next) => {
  const device = response.locals.device as DeviceDocument;
  try {
    const input = scanSchema.parse(request.body), identity = input.qr ?? { dni: input.dni! };
    if (route === "present") {
      const sessionId = objectIdSchema.parse(input.sessionId);
      response.json(await confirmCheckIn(request.cookies[DEVICE_COOKIE], identity, sessionId)); return;
    }
    const sessions = await eligibleSessions(device, identity);
    if (!sessions.length) throw new AppError(422, "No tenés una clase habilitada en este horario. Consultá en recepción.", "NO_ELIGIBLE_SESSIONS");
    if (sessions.length > 1) { response.json({ kind: "SELECT", sessions }); return; }
    response.json(await confirmCheckIn(request.cookies[DEVICE_COOKIE], identity, sessions[0].id));
  } catch (error) {
    // Never store the submitted QR/DNI, an IP, a debt amount or an untrusted error message.
    await CheckInAttemptModel.create({ organizationId: device.organizationId, deviceId: device._id,
      code: error instanceof AppError ? error.code : "CHECK_IN_FAILED" }).catch(() => undefined);
    next(error);
  }
});
