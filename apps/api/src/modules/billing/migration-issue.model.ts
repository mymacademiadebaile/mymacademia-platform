import { Schema, Types, model } from "mongoose";

/** Legacy data the migration could not convert without guessing. Waits for an administrator. */
export interface MigrationIssue {
  organizationId: Types.ObjectId;
  kind: string;
  entityType: string;
  entityId: Types.ObjectId;
  message: string;
  data?: Record<string, unknown>;
  status: "OPEN" | "RESOLVED";
  resolvedAt?: Date;
  resolvedByUserId?: Types.ObjectId;
  resolution?: string;
}

const migrationIssueSchema = new Schema<MigrationIssue>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    kind: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["OPEN", "RESOLVED"], default: "OPEN", index: true },
    resolvedAt: { type: Date },
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    resolution: { type: String, trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

migrationIssueSchema.index({ organizationId: 1, kind: 1, entityId: 1 }, { unique: true });

export const MigrationIssueModel = model<MigrationIssue>("MigrationIssue", migrationIssueSchema);
