import multer from "multer";
import { AppError } from "../common/http/app-error";
import { getCloudinary, uploadBuffer } from "./cloudinary";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

export async function deleteAcademySpaceImage(organizationId: string, slot: AcademySpaceImageSlot) {
  await getCloudinary().uploader.destroy(`${folder(organizationId)}/${slot}`, {
    resource_type: "image",
    invalidate: true
  });
}
