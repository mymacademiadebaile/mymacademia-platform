import { Schema, model } from "mongoose";

export interface LandingImage {
  url: string;
  width?: number;
  height?: number;
}

export interface AcademySpaceImages {
  tall?: LandingImage;
  wide?: LandingImage;
  detail?: LandingImage;
}

const landingImageSchema = new Schema<LandingImage>(
  {
    url: { type: String, trim: true },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 }
  },
  { _id: false }
);

export interface Organization {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  inquiryContactName?: string;
  inquiryWhatsApp?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  timezone?: string;
  /** Minimum notice required to cancel a booked class session. */
  cancellationNoticeHours: number;
  /** Optional photos replacing the default collage in landing section 06. */
  academySpaceImages?: AcademySpaceImages;
  isActive: boolean;
}

const organizationSchema = new Schema<Organization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    inquiryContactName: { type: String, trim: true, maxlength: 120 },
    inquiryWhatsApp: { type: String, trim: true, maxlength: 50 },
    instagramUrl: { type: String, trim: true, maxlength: 500 },
    tiktokUrl: { type: String, trim: true, maxlength: 500 },
    facebookUrl: { type: String, trim: true, maxlength: 500 },
    youtubeUrl: { type: String, trim: true, maxlength: 500 },
    timezone: { type: String, trim: true, default: "America/Argentina/Buenos_Aires" },
    cancellationNoticeHours: { type: Number, min: 0, max: 168, default: 6 },
    academySpaceImages: {
      tall: { type: landingImageSchema, default: undefined },
      wide: { type: landingImageSchema, default: undefined },
      detail: { type: landingImageSchema, default: undefined }
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const OrganizationModel = model<Organization>("Organization", organizationSchema);
