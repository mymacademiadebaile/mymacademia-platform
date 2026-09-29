import { v2 as cloudinary } from "cloudinary";
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
