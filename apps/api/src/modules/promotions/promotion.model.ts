import { Schema, Types, model } from "mongoose";

export const PROMOTION_KINDS = ["PERCENT", "AMOUNT_OFF", "FINAL_PRICE", "TWO_FOR_ONE"] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];
export const PROMOTION_CHARGE_KINDS = ["MONTHLY_FEE", "CLASS_FEE", "BOTH"] as const;

export interface Promotion {
  organizationId: Types.ObjectId;
  classId: Types.ObjectId;
  name: string;
  kind: PromotionKind;
  appliesTo: (typeof PROMOTION_CHARGE_KINDS)[number];
  /** Integer hundredths of a percent: 12.5% = 1250. */
  percentBasisPoints?: number;
  valueCents?: number;
  /** Inclusive dates when a new pair may join a TWO_FOR_ONE promotion. */
  registrationFrom?: string;
  registrationTo?: string;
  /** Inclusive service dates covered by the granted benefit. */
  benefitFrom: string;
  benefitTo: string;
  /** When present only this occurrence qualifies. */
  sessionId?: Types.ObjectId;
  status: "ACTIVE" | "INACTIVE";
  createdByUserId?: Types.ObjectId;
}

const dateField = { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ };

const schema = new Schema<Promotion>({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  kind: { type: String, enum: PROMOTION_KINDS, required: true },
  appliesTo: { type: String, enum: PROMOTION_CHARGE_KINDS, required: true },
  percentBasisPoints: { type: Number, min: 1, max: 10000 },
  valueCents: { type: Number, min: 0 },
  registrationFrom: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  registrationTo: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  benefitFrom: dateField,
  benefitTo: dateField,
  sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession" },
  status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  createdByUserId: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

schema.index({ organizationId: 1, classId: 1, status: 1, appliesTo: 1, benefitFrom: 1, benefitTo: 1 });

export const PromotionModel = model<Promotion>("Promotion", schema);
