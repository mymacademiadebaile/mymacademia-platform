import { Schema, Types, model } from "mongoose";

export interface Branch {
  organizationId: Types.ObjectId;
  name: string;
  address?: string;
  isActive: boolean;
}

const branchSchema = new Schema<Branch>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

branchSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const BranchModel = model<Branch>("Branch", branchSchema);
