import { Schema, Types, model, type HydratedDocument } from "mongoose";

export interface CheckInCredential {
  organizationId: Types.ObjectId;
  contactId: Types.ObjectId;
  tokenHash: string;
  active: boolean;
  issuedByUserId: Types.ObjectId;
  revokedAt?: Date;
  lastUsedAt?: Date;
}
const credentialSchema = new Schema<CheckInCredential>({
  organizationId: { type: Schema.Types.ObjectId, required: true }, contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
  tokenHash: { type: String, required: true, select: false }, active: { type: Boolean, default: true },
  issuedByUserId: { type: Schema.Types.ObjectId, required: true }, revokedAt: Date, lastUsedAt: Date
}, { timestamps: true });
credentialSchema.index({ tokenHash: 1 }, { unique: true });
credentialSchema.index({ organizationId: 1, contactId: 1 }, { unique: true, partialFilterExpression: { active: true } });
export const CheckInCredentialModel = model<CheckInCredential>("CheckInCredential", credentialSchema);

export interface CheckInDevice {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  name: string;
  authorizedByUserId: Types.ObjectId;
  activationHash?: string;
  activationExpiresAt?: Date;
  sessionHash?: string;
  sessionExpiresAt?: Date;
  revokedAt?: Date;
  activatedAt?: Date;
  lastSeenAt?: Date;
  beforeMinutes: number;
  afterMinutes: number;
  soundEnabled: boolean;
  volume: number;
}
const deviceSchema = new Schema<CheckInDevice>({
  organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true }, name: { type: String, required: true, maxlength: 80 },
  authorizedByUserId: { type: Schema.Types.ObjectId, required: true }, activationHash: { type: String, select: false }, activationExpiresAt: Date,
  sessionHash: { type: String, select: false }, sessionExpiresAt: Date, revokedAt: Date, activatedAt: Date, lastSeenAt: Date,
  beforeMinutes: { type: Number, default: 45, min: 0, max: 180 }, afterMinutes: { type: Number, default: 20, min: 0, max: 180 },
  soundEnabled: { type: Boolean, default: true }, volume: { type: Number, default: 0.5, min: 0, max: 1 }
}, { timestamps: true });
for (const field of ["activationHash", "sessionHash"]) deviceSchema.index({ [field]: 1 }, { unique: true, partialFilterExpression: { [field]: { $type: "string" } } });
export const CheckInDeviceModel = model<CheckInDevice>("CheckInDevice", deviceSchema);
export type DeviceDocument = HydratedDocument<CheckInDevice>;

interface CheckInAttempt { organizationId: Types.ObjectId; deviceId: Types.ObjectId; code: string; createdAt: Date }
const attemptSchema = new Schema<CheckInAttempt>({ organizationId: { type: Schema.Types.ObjectId, required: true },
  deviceId: { type: Schema.Types.ObjectId, required: true, ref: "CheckInDevice" }, code: { type: String, required: true } }, { timestamps: { createdAt: true, updatedAt: false } });
attemptSchema.index({ organizationId: 1, createdAt: -1 });
attemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const CheckInAttemptModel = model<CheckInAttempt>("CheckInAttempt", attemptSchema);
