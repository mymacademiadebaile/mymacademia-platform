import { Schema, model } from "mongoose";

export interface Organization {
  name: string;
  slug: string;
  isActive: boolean;
}

const organizationSchema = new Schema<Organization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const OrganizationModel = model<Organization>("Organization", organizationSchema);
