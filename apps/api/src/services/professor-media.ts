import multer from "multer";
import { createHash } from "node:crypto";
import { AppError } from "../common/http/app-error";
import { getCloudinary, uploadBuffer } from "./cloudinary";
import { env } from "../config/env";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const VIDEO_FORMATS = "mp4,webm,mov";
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

function memoryUpload(
  maxBytes: number,
  allowedTypes: Set<string>,
  invalidMessage: string,
  invalidCode: string
) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (_request, file, callback) => {
      if (!allowedTypes.has(file.mimetype)) {
        callback(new AppError(422, invalidMessage, invalidCode));
        return;
      }
      callback(null, true);
    }
  });
}

export const professorAvatarUpload = memoryUpload(
  5 * 1024 * 1024,
  IMAGE_TYPES,
  "La foto debe ser JPG, PNG o WEBP",
  "UNSUPPORTED_PROFESSOR_AVATAR_TYPE"
);

export const professorVideoUpload = memoryUpload(
  60 * 1024 * 1024,
  VIDEO_TYPES,
  "El video debe ser MP4, WEBM o MOV",
  "UNSUPPORTED_PROFESSOR_VIDEO_TYPE"
);

function folder(organizationId: string, professorId: string) {
  return `mym-academia/${organizationId}/professors/${professorId}`;
}

export type ProfessorVideoUploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  uploadPublicId: string;
  allowedFormats: string;
};

/**
 * Creates the short-lived credentials used by the browser to upload a video
 * directly to Cloudinary. Sending the video through a Vercel Function would
 * hit Vercel's 4.5 MB request-body limit before Multer could process it.
 */
export function createProfessorIntroVideoUploadSignature(
  organizationId: string,
  professorId: string
): ProfessorVideoUploadSignature {
  getCloudinary();

  const timestamp = Math.floor(Date.now() / 1000);
  const targetFolder = folder(organizationId, professorId);
  const uploadPublicId = "intro-video";
  const publicId = `${targetFolder}/${uploadPublicId}`;
  const params = {
    allowed_formats: VIDEO_FORMATS,
    folder: targetFolder,
    overwrite: "true",
    public_id: uploadPublicId,
    timestamp
  };
  const toSign = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signature = createHash("sha1")
    .update(`${toSign}${env.CLOUDINARY_API_SECRET!}`)
    .digest("hex");

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder: targetFolder,
    publicId,
    uploadPublicId,
    allowedFormats: VIDEO_FORMATS
  };
}

/**
 * Reads the uploaded asset from Cloudinary instead of accepting a URL supplied
 * by the browser. That keeps the professor profile bound to its own video.
 */
export async function confirmProfessorIntroVideoUpload(
  organizationId: string,
  professorId: string,
  publicId: string
): Promise<string> {
  const expectedPublicId = `${folder(organizationId, professorId)}/intro-video`;

  if (publicId !== expectedPublicId) {
    throw new AppError(422, "El video no corresponde a este profesor", "INVALID_PROFESSOR_VIDEO");
  }

  const asset = await getCloudinary().api.resource(expectedPublicId, {
    resource_type: "video",
    type: "upload"
  });

  const validFormat = typeof asset.format === "string" && VIDEO_FORMATS.split(",").includes(asset.format);
  const validSize = typeof asset.bytes === "number" && asset.bytes <= MAX_VIDEO_BYTES;

  if (asset.resource_type !== "video" || typeof asset.secure_url !== "string" || !validFormat || !validSize) {
    await getCloudinary()
      .uploader.destroy(expectedPublicId, { resource_type: "video", invalidate: true })
      .catch(() => undefined);
    throw new AppError(422, "No pudimos validar el video cargado", "INVALID_PROFESSOR_VIDEO");
  }

  return asset.secure_url;
}

export function uploadProfessorAvatar(
  buffer: Buffer,
  organizationId: string,
  professorId: string
) {
  return uploadBuffer(buffer, {
    folder: folder(organizationId, professorId),
    publicId: "avatar"
  });
}

export function uploadProfessorIntroVideo(
  buffer: Buffer,
  organizationId: string,
  professorId: string
) {
  return uploadBuffer(buffer, {
    folder: folder(organizationId, professorId),
    publicId: "intro-video"
  });
}

export async function deleteProfessorMedia(
  organizationId: string,
  professorId: string,
  kind: "avatar" | "intro-video"
) {
  const client = getCloudinary();
  const publicId = `${folder(organizationId, professorId)}/${kind}`;

  await client.uploader.destroy(publicId, {
    resource_type: kind === "avatar" ? "image" : "video",
    invalidate: true
  });
}

// ---- Rhythm (dance discipline) cover image, shown on the public website ----

// Vercel serverless functions accept at most ~4.5 MB per request body.
export const rhythmImageUpload = memoryUpload(
  4 * 1024 * 1024,
  IMAGE_TYPES,
  "La imagen debe ser JPG, PNG o WEBP",
  "UNSUPPORTED_RHYTHM_IMAGE_TYPE"
);

function rhythmFolder(organizationId: string, rhythmId: string) {
  return `mym-academia/${organizationId}/rhythms/${rhythmId}`;
}

export function uploadRhythmImage(buffer: Buffer, organizationId: string, rhythmId: string) {
  return uploadBuffer(buffer, {
    folder: rhythmFolder(organizationId, rhythmId),
    publicId: "cover"
  });
}

export async function deleteRhythmImage(organizationId: string, rhythmId: string) {
  await getCloudinary().uploader.destroy(`${rhythmFolder(organizationId, rhythmId)}/cover`, {
    resource_type: "image",
    invalidate: true
  });
}
