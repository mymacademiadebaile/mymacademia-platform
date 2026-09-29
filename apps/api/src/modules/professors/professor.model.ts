import { Schema, Types, model } from "mongoose";

export interface Professor {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  disciplineIds: Types.ObjectId[];
  displayName: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  instagram?: string;
  isActive: boolean;
}

const professorSchema = new Schema<Professor>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    disciplineIds: [{ type: Schema.Types.ObjectId, ref: "CatalogItem" }],
    displayName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 600 },
    avatarUrl: { type: String, trim: true },
    instagram: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

professorSchema.index({ organizationId: 1, isActive: 1, displayName: 1 });

export const ProfessorModel = model<Professor>("Professor", professorSchema);
