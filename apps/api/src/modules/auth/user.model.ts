import { USER_ROLES, type UserRole } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

export interface User {
  organizationId: Types.ObjectId;
  branchIds: Types.ObjectId[];
  email: string;
  userName?: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
}

const userSchema = new Schema<User>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchIds: [{ type: Schema.Types.ObjectId, ref: "Branch" }],
    email: { type: String, required: true, trim: true, lowercase: true },
    userName: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
// Partial so users without a userName do not collide on a missing value.
userSchema.index(
  { organizationId: 1, userName: 1 },
  { unique: true, partialFilterExpression: { userName: { $type: "string" } } }
);

export const UserModel = model<User>("User", userSchema);
