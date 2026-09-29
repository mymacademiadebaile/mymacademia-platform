import "dotenv/config";
import { z } from "zod";

const booleanEnv = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),

  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/mymacademia"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default("development-only-secret-change-before-production"),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),

  SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: booleanEnv.default("true"),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM_NAME: z.string().min(1).default("M&M Academia")
});

export const env = envSchema.parse(process.env);
