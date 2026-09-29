import { Schema, model } from "mongoose";

export interface Organization {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  timezone?: string;
  isActive: boolean;
}

const organizationSchema = new Schema<Organization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    timezone: { type: String, trim: true, default: "America/Argentina/Buenos_Aires" },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const OrganizationModel = model<Organization>("Organization", organizationSchema);
