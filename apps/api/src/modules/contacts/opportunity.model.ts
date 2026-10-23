import { Schema, Types, model } from "mongoose";
import { OPPORTUNITY_STATUSES } from "@mym/shared";

export { OPPORTUNITY_STATUSES };
export interface Opportunity {
  organizationId: Types.ObjectId;
  contactId: Types.ObjectId;
  classId: Types.ObjectId;
  status: typeof OPPORTUNITY_STATUSES[number];
  notes?: string;
  followUpOn?: string;
  convertedEnrollmentId?: Types.ObjectId;
}
const schema = new Schema<Opportunity>({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
  classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true },
  status: { type: String, enum: OPPORTUNITY_STATUSES, default: "OPEN" },
  notes: { type: String, maxlength: 1000 }, followUpOn: String,
  convertedEnrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment" }
}, { timestamps: true });
schema.index({ organizationId: 1, contactId: 1, classId: 1 }, { unique: true });
export const OpportunityModel = model<Opportunity>("Opportunity", schema);
