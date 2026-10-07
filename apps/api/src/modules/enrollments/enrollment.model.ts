import { MID_MONTH_POLICIES, PAYMENT_TYPES, type MidMonthPolicy, type PaymentType } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

const ENROLLMENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

/** A stretch of time in which the student belonged to the group. Dates are inclusive calendar days. */
export interface EnrollmentPeriod {
  startDate: string;
  endDate?: string;
  endReason?: string;
}

/** Billing mode in force from `effectiveDate` on. */
export interface BillingChange {
  effectiveDate: string;
  mode: PaymentType;
  changedByUserId?: Types.ObjectId;
  changedAt?: Date;
}

/** Optional commercial conditions of this enrollment. Absent fields use the group's prices. */
export interface PriceOverride {
  monthlyCents?: number;
  perClassCents?: number;
  note?: string;
}

/**
 * The student's membership in a group. One document per student and group: leaving closes the
 * current period, enrolling again opens a new one, so history is never overwritten.
 */
export interface Enrollment {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  studentId: Types.ObjectId;
  /** Current billing mode. History lives in `billingChanges`. */
  billingPreference?: PaymentType;
  billingChanges: BillingChange[];
  /**
   * Legacy recurring slot selection ("DAY:HH:MM:HH:MM"). Empty means every slot.
   * Superseded by `seriesIds`, which survive schedule changes.
   */
  scheduleKeys: string[];
  /** Habitual schedule series. Used for rosters and capacity, never as an attendance limit. */
  seriesIds: Types.ObjectId[];
  status: EnrollmentStatus;
  enrolledAt: Date;
  endedAt?: Date;
  periods: EnrollmentPeriod[];
  priceOverride?: PriceOverride;
  /** How the first monthly fee was billed when the student joined mid-month. */
  joinPolicy?: MidMonthPolicy;
  joinCustomCents?: number;
}

const periodSchema = new Schema<EnrollmentPeriod>(
  {
    startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    endReason: { type: String, trim: true, maxlength: 300 }
  },
  { _id: false }
);

const billingChangeSchema = new Schema<BillingChange>(
  {
    effectiveDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    mode: { type: String, enum: PAYMENT_TYPES, required: true },
    changedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    changedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const enrollmentSchema = new Schema<Enrollment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    billingPreference: { type: String, enum: PAYMENT_TYPES },
    billingChanges: { type: [billingChangeSchema], default: [] },
    scheduleKeys: { type: [String], default: [] },
    seriesIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: "ACTIVE" },
    enrolledAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    periods: { type: [periodSchema], default: [] },
    priceOverride: {
      monthlyCents: { type: Number, min: 0 },
      perClassCents: { type: Number, min: 0 },
      note: { type: String, trim: true, maxlength: 300 }
    },
    joinPolicy: { type: String, enum: MID_MONTH_POLICIES },
    joinCustomCents: { type: Number, min: 0 }
  },
  { timestamps: true }
);

enrollmentSchema.index({ organizationId: 1, classId: 1, studentId: 1 }, { unique: true });

export const EnrollmentModel = model<Enrollment>("Enrollment", enrollmentSchema);
