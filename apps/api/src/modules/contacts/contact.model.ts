import { Schema, Types, model } from "mongoose";

/** A person's identity. When an academic profile exists its _id is deliberately the same. */
export interface Contact {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  creationKey?: string;
  source: { platform: string; campaign?: string; advertisement?: string; externalId?: string; firstContactAt?: Date };
  preferences: { emailReminders: boolean; marketing: boolean };
  notes?: string;
  isActive: boolean;
}

const schema = new Schema<Contact>({
  organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  creationKey: String,
  source: {
    platform: { type: String, default: "RECEPTION", maxlength: 80 },
    campaign: { type: String, maxlength: 160 }, advertisement: { type: String, maxlength: 160 },
    externalId: { type: String, maxlength: 160 }, firstContactAt: { type: Date, default: Date.now }
  },
  preferences: { emailReminders: { type: Boolean, default: true }, marketing: { type: Boolean, default: false } },
  notes: { type: String, maxlength: 1000 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
// Shared family emails/phones are not identity proofs: ambiguity is resolved by reception, never merged.
schema.index({ organizationId: 1, email: 1 });
schema.index({ organizationId: 1, phone: 1 });
schema.index({ organizationId: 1, creationKey: 1 }, { unique: true, partialFilterExpression: { creationKey: { $type: "string" } } });
schema.index({ organizationId: 1, lastName: 1, firstName: 1 });
export const ContactModel = model<Contact>("Contact", schema);
