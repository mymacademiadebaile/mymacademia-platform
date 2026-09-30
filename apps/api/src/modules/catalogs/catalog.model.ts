import { CATALOG_TYPES, type CatalogType } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

export interface CatalogItemImage {
  url: string;
  width?: number;
  height?: number;
}

/**
 * Public website fields. Only meaningful for `type: "DISCIPLINE"` (a rhythm).
 * A rhythm shows up on the website when `isActive && publishOnWeb`.
 */
export interface CatalogItem {
  organizationId: Types.ObjectId;
  type: CatalogType;
  name: string;
  normalizedName: string;
  isActive: boolean;
  sortOrder: number;
  slug?: string;
  tagline?: string;
  description?: string;
  image?: CatalogItemImage;
  publishOnWeb: boolean;
}

const catalogItemSchema = new Schema<CatalogItem>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    type: { type: String, enum: CATALOG_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    slug: { type: String, trim: true, lowercase: true },
    tagline: { type: String, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    image: {
      type: new Schema<CatalogItemImage>(
        {
          url: { type: String, required: true, trim: true },
          width: { type: Number },
          height: { type: Number }
        },
        { _id: false }
      )
    },
    publishOnWeb: { type: Boolean, default: false }
  },
  { timestamps: true }
);

catalogItemSchema.index(
  { organizationId: 1, type: 1, normalizedName: 1 },
  { unique: true }
);

// Stable public URL per rhythm. Partial so items without a slug (never published) do not collide.
catalogItemSchema.index(
  { organizationId: 1, type: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } }
);

export const CatalogItemModel = model<CatalogItem>("CatalogItem", catalogItemSchema);
