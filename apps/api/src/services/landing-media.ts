import multer from "multer";
import { createHash } from "node:crypto";
import { AppError } from "../common/http/app-error";
import { getCloudinary, uploadBuffer } from "./cloudinary";
import { env } from "../config/env";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_FORMATS = "jpg,jpeg,png,webp";
const MAX_LANDING_IMAGE_BYTES = 20 * 1024 * 1024;

/** Landing photos are intentionally kept below Vercel's serverless request limit. */
export const landingImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!IMAGE_TYPES.has(file.mimetype)) {
      callback(new AppError(422, "La imagen debe ser JPG, PNG o WEBP", "UNSUPPORTED_LANDING_IMAGE_TYPE"));
      return;
    }
    callback(null, true);
  }
});

export type AcademySpaceImageSlot = "tall" | "wide" | "detail";

export type AcademySpaceImageUploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadPublicId: string;
  allowedFormats: string;
};

function folder(organizationId: string) {
  return `mym-academia/${organizationId}/landing/academy-space`;
}

export function uploadAcademySpaceImage(
  buffer: Buffer,
  organizationId: string,
  slot: AcademySpaceImageSlot
) {
  return uploadBuffer(buffer, { folder: folder(organizationId), publicId: slot });
}

/**
 * The browser uploads landing photos directly to Cloudinary. This keeps larger
 * editorial images out of Vercel's request-body limit while retaining a
 * server-issued, slot-specific signature.
 */
export function createAcademySpaceImageUploadSignature(
  organizationId: string,
  slot: AcademySpaceImageSlot
): AcademySpaceImageUploadSignature {
  getCloudinary();

  const timestamp = Math.floor(Date.now() / 1000);
  const targetFolder = folder(organizationId);
  const params = {
    allowed_formats: IMAGE_FORMATS,
    folder: targetFolder,
    overwrite: "true",
    public_id: slot,
    timestamp
  };
  const toSign = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature: createHash("sha1").update(`${toSign}${env.CLOUDINARY_API_SECRET!}`).digest("hex"),
    folder: targetFolder,
    publicId: `${targetFolder}/${slot}`,
    uploadPublicId: slot,
    allowedFormats: IMAGE_FORMATS
  };
}

/** Confirms the browser uploaded exactly the expected, safe landing image. */
export async function confirmAcademySpaceImageUpload(
  organizationId: string,
  slot: AcademySpaceImageSlot,
  publicId: string
) {
  const expectedPublicId = `${folder(organizationId)}/${slot}`;
  if (publicId !== expectedPublicId) {
    throw new AppError(422, "La imagen no corresponde a esta sección", "INVALID_LANDING_IMAGE");
  }

  const asset = await getCloudinary().api.resource(expectedPublicId, {
    resource_type: "image",
    type: "upload"
  });
  const validFormat = typeof asset.format === "string" && IMAGE_FORMATS.split(",").includes(asset.format);
  const validSize = typeof asset.bytes === "number" && asset.bytes <= MAX_LANDING_IMAGE_BYTES;

  if (asset.resource_type !== "image" || typeof asset.secure_url !== "string" || !validFormat || !validSize) {
    await getCloudinary().uploader.destroy(expectedPublicId, { resource_type: "image", invalidate: true }).catch(() => undefined);
    throw new AppError(422, "La imagen debe ser JPG, PNG o WEBP de hasta 20 MB", "INVALID_LANDING_IMAGE");
  }

  return asset;
}

export async function deleteAcademySpaceImage(organizationId: string, slot: AcademySpaceImageSlot) {
  await getCloudinary().uploader.destroy(`${folder(organizationId)}/${slot}`, {
    resource_type: "image",
    invalidate: true
  });
}
