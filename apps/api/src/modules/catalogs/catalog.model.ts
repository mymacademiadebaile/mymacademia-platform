import { CATALOG_TYPES, type CatalogType } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

export interface CatalogItem {
  organizationId: Types.ObjectId;
  type: CatalogType;
  name: string;
  normalizedName: string;
  isActive: boolean;
  sortOrder: number;
}

const catalogItemSchema = new Schema<CatalogItem>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    type: { type: String, enum: CATALOG_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

catalogItemSchema.index(
  { organizationId: 1, type: 1, normalizedName: 1 },
  { unique: true }
);

export const CatalogItemModel = model<CatalogItem>("CatalogItem", catalogItemSchema);
