import { Schema, Types, model } from "mongoose";

const CHANNELS = ["EMAIL", "WHATSAPP"] as const;
const TYPES = ["DEBT_REMINDER", "CLASS_REMINDER", "PROMOTION", "SESSION_CHANGE"] as const;
const STATUSES = ["PENDING", "SENT", "FAILED", "OPENED"] as const;

type Channel = (typeof CHANNELS)[number];
type NotificationType = (typeof TYPES)[number];
type NotificationStatus = (typeof STATUSES)[number];

export interface NotificationLog {
  organizationId: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  studentId?: Types.ObjectId;
  channel: Channel;
  type: NotificationType;
  destination: string;
  subject?: string;
  message: string;
  status: NotificationStatus;
  errorMessage?: string;
  sentAt?: Date;
}

const notificationLogSchema = new Schema<NotificationLog>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", index: true },
    channel: { type: String, enum: CHANNELS, required: true },
    type: { type: String, enum: TYPES, required: true },
    destination: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    message: { type: String, required: true },
    status: { type: String, enum: STATUSES, default: "PENDING", index: true },
    errorMessage: { type: String },
    sentAt: { type: Date }
  },
  { timestamps: true }
);

notificationLogSchema.index({ organizationId: 1, createdAt: -1 });
notificationLogSchema.index({ organizationId: 1, channel: 1, status: 1, createdAt: -1 });

export const NotificationLogModel = model<NotificationLog>(
  "NotificationLog",
  notificationLogSchema
);
