import { PAYMENT_TYPES, type PaymentType } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

const ENROLLMENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export interface Enrollment {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  studentId: Types.ObjectId;
  billingPreference?: PaymentType;
  /** Recurring slots selected by the student. Empty on legacy enrollments means every slot. */
  scheduleKeys: string[];
  status: EnrollmentStatus;
  enrolledAt: Date;
  endedAt?: Date;
}

const enrollmentSchema = new Schema<Enrollment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    billingPreference: { type: String, enum: PAYMENT_TYPES },
    scheduleKeys: { type: [String], default: [] },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: "ACTIVE" },
    enrolledAt: { type: Date, default: Date.now },
    endedAt: { type: Date }
  },
  { timestamps: true }
);

enrollmentSchema.index({ organizationId: 1, classId: 1, studentId: 1 }, { unique: true });

export const EnrollmentModel = model<Enrollment>("Enrollment", enrollmentSchema);
