import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../../common/http/app-error";
import { withRequiredTransaction } from "../../common/required-transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { resolveContact } from "../contacts/contact-service";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { CheckInCredentialModel, type CheckInDevice } from "./check-in.models";

export const opaqueToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const QR_PREFIX = "mym:check-in:";
export function qrHash(value: string) {
  if (!new RegExp(`^${QR_PREFIX}[A-Za-z0-9_-]{43}$`).test(value)) throw new AppError(401, "El QR no es válido. Pedí ayuda en recepción.", "INVALID_QR");
  return tokenHash(value.slice(QR_PREFIX.length));
}
export function deviceView(device: CheckInDevice & { _id: unknown }) {
  return { id: String(device._id), name: device.name, branchId: String(device.branchId), revokedAt: device.revokedAt,
    activatedAt: device.activatedAt, lastSeenAt: device.lastSeenAt, sessionExpiresAt: device.sessionExpiresAt,
    beforeMinutes: device.beforeMinutes, afterMinutes: device.afterMinutes, soundEnabled: device.soundEnabled, volume: device.volume };
}
export async function rotateCredential(actor: { organizationId: string; userId: string }, contactId: string, revokeOnly = false) {
  const keys = [`contact:${contactId}`]; await ensureLocks(actor.organizationId, keys);
  const raw = opaqueToken();
  return withRequiredTransaction(async (session) => {
    await touchLocks(actor.organizationId, keys, session);
    const contact = await resolveContact(actor.organizationId, contactId, session);
    if (!contact.isActive) throw new AppError(422, "El contacto está inactivo", "CONTACT_INACTIVE");
    await CheckInCredentialModel.updateMany({ organizationId: actor.organizationId, contactId, active: true },
      { $set: { active: false, revokedAt: new Date() } }, { session });
    if (!revokeOnly) await CheckInCredentialModel.create([{ organizationId: actor.organizationId, contactId, tokenHash: tokenHash(raw), active: true, issuedByUserId: actor.userId }], { session });
    await AuditLogModel.create([{ organizationId: actor.organizationId, actorUserId: actor.userId, action: revokeOnly ? "CHECK_IN_QR_REVOKED" : "CHECK_IN_QR_ROTATED",
      entityType: "Contact", entityId: contactId }], { session });
    return revokeOnly ? { revoked: true as const } : { qr: `${QR_PREFIX}${raw}` };
  });
}
