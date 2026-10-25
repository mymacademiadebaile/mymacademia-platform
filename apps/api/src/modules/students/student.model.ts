import { Schema, Types, model } from "mongoose";
import { normalizeDni } from "../../common/dni";

export interface Student {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  contactId?: Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dni?: string;
  birthDate?: Date;
  guardianName?: string;
  guardianPhone?: string;
  notes?: string;
  isActive: boolean;
}

const studentSchema = new Schema<Student>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact" },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    dni: { type: String, set: (value: string | undefined) => value ? normalizeDni(value) : undefined, match: /^\d{6,9}$/ },
    birthDate: { type: Date },
    guardianName: { type: String, trim: true },
    guardianPhone: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

studentSchema.index({ organizationId: 1, branchId: 1, lastName: 1, firstName: 1 });
studentSchema.index({ organizationId: 1, dni: 1 });
studentSchema.index({ organizationId: 1, contactId: 1 }, { unique: true, partialFilterExpression: { contactId: { $type: "objectId" } } });

export const StudentModel = model<Student>("Student", studentSchema);
