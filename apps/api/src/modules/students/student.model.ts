import { Schema, Types, model } from "mongoose";

export interface Student {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
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
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    birthDate: { type: Date },
    guardianName: { type: String, trim: true },
    guardianPhone: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

studentSchema.index({ organizationId: 1, branchId: 1, lastName: 1, firstName: 1 });

export const StudentModel = model<Student>("Student", studentSchema);
