import multer from "multer";
import { AppError } from "../common/http/app-error";
import { getCloudinary, uploadBuffer } from "./cloudinary";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

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
