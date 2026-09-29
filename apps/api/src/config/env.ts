import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/mymacademia"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default("development-only-secret-change-before-production"),
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).optional()
});

export const env = envSchema.parse(process.env);
