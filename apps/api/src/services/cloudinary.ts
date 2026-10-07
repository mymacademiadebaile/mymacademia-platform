import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { AppError } from "../common/http/app-error";
import { env } from "../config/env";

let configured = false;

export function getCloudinary() {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    throw new AppError(
      503,
      "Cloudinary is not configured",
      "CLOUDINARY_NOT_CONFIGURED"
    );
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true
    });

    configured = true;
  }

  return cloudinary;
}

export function uploadBuffer(
  buffer: Buffer,
  options: { folder: string; publicId?: string }
): Promise<UploadApiResponse> {
  const client = getCloudinary();

  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: "auto",
        overwrite: true
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

/**
 * Uploads a financial document (transfer proof) as an authenticated asset: it cannot be opened
 * with a plain URL, only through a short-lived signed link. Every upload gets its own public id,
 * so a replacement never erases the previous proof.
 */
export function uploadPrivateBuffer(
  buffer: Buffer,
  options: { folder: string; publicId: string }
): Promise<UploadApiResponse> {
  const client = getCloudinary();

  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        folder: options.folder,
        public_id: options.publicId,
        resource_type: "auto",
        type: "authenticated",
        overwrite: false
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

/** Signed link to a private asset, valid for a few minutes. */
export function privateAssetUrl(asset: { publicId: string; resourceType: string; format?: string }, ttlSeconds = 300) {
  const client = getCloudinary();
  return client.utils.private_download_url(asset.publicId, asset.format ?? "", {
    resource_type: asset.resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds
  });
}
