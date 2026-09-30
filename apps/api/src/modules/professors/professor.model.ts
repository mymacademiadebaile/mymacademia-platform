import { Schema, Types, model } from "mongoose";

export interface Professor {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  disciplineIds: Types.ObjectId[];
  displayName: string;
  phone?: string;
  /** One-liner for cards on the website. */
  bioShort?: string;
  /** Full biography, shown on the professor page. */
  bio?: string;
  avatarUrl?: string;
  introVideoUrl?: string;
  instagram?: string;
  /** Stable public URL, generated the first time the profile is published. */
  slug?: string;
  /** A professor shows up on the website when `isActive && publishOnWeb`. */
  publishOnWeb: boolean;
  isActive: boolean;
}

const professorSchema = new Schema<Professor>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    disciplineIds: [{ type: Schema.Types.ObjectId, ref: "CatalogItem" }],
    displayName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    bioShort: { type: String, trim: true, maxlength: 160 },
    bio: { type: String, trim: true, maxlength: 2000 },
    avatarUrl: { type: String, trim: true },
    introVideoUrl: { type: String, trim: true },
    instagram: { type: String, trim: true },
    slug: { type: String, trim: true, lowercase: true },
    publishOnWeb: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

professorSchema.index({ organizationId: 1, isActive: 1, displayName: 1 });

professorSchema.index(
  { organizationId: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } }
);

export const ProfessorModel = model<Professor>("Professor", professorSchema);
