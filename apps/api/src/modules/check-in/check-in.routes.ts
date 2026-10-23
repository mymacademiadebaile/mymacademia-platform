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

export const DEVICE_COOKIE = "mym_kiosk";
export const checkInRouter = Router();
checkInRouter.use((_request, response, next) => { response.setHeader("Cache-Control", "no-store, private"); next(); });
checkInRouter.use((request, _response, next) => {
  if (request.method !== "GET" && request.headers.origin && request.headers.origin !== env.APP_ORIGIN) {
    next(new AppError(403, "El origen de la solicitud no está autorizado", "INVALID_ORIGIN")); return;
  }
  next();
});
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/check-in" };

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
  standardHeaders: "draft-7", legacyHeaders: false, message: { message: "Esperá un momento y volvé a acercar el QR", error: "CHECK_IN_RATE_LIMIT" } }));
checkInRouter.get("/device", (_request, response) => {
  for (const name of ["mym_access", "mym_refresh"]) response.clearCookie(name, { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  response.json(deviceView(response.locals.device as DeviceDocument));
});
checkInRouter.post("/logout", async (_request, response, next) => {
  try {
    const device = response.locals.device as DeviceDocument;
    await CheckInDeviceModel.updateOne({ _id: device._id }, { $unset: { sessionHash: 1, sessionExpiresAt: 1 } });
    response.clearCookie(DEVICE_COOKIE, cookieOptions); response.status(204).send();
  } catch (error) { next(error); }
});
const scanSchema = z.object({ qr: z.string().min(1).max(80) });
for (const route of ["scan", "present"] as const) checkInRouter.post(`/${route}`, async (request, response, next) => {
  const device = response.locals.device as DeviceDocument;
  try {
    const { qr } = scanSchema.parse(request.body);
    if (route === "present") {
      const { sessionId } = z.object({ sessionId: objectIdSchema }).parse(request.body);
      response.json(await confirmCheckIn(request.cookies[DEVICE_COOKIE], qr, sessionId)); return;
    }
    const sessions = await eligibleSessions(device, qr);
    if (!sessions.length) throw new AppError(422, "No tenés una clase habilitada en este horario. Consultá en recepción.", "NO_ELIGIBLE_SESSIONS");
    if (sessions.length > 1) { response.json({ kind: "SELECT", sessions }); return; }
    response.json(await confirmCheckIn(request.cookies[DEVICE_COOKIE], qr, sessions[0].id));
  } catch (error) {
    // Never store the submitted QR, an IP, a debt amount or an untrusted error message.
    await CheckInAttemptModel.create({ organizationId: device.organizationId, deviceId: device._id,
      code: error instanceof AppError ? error.code : "CHECK_IN_FAILED" }).catch(() => undefined);
    next(error);
  }
});
