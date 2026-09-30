import { z } from "zod";

export const DEV_JWT_ACCESS_SECRET = "development-only-secret-change-before-production";
export const DEV_MONGODB_URI = "mongodb://127.0.0.1:27017/mymacademia";
export const DEV_APP_ORIGIN = "http://localhost:3000";

const PLACEHOLDER_JWT_ACCESS_SECRET = "replace-with-a-long-random-secret-at-least-32-characters";

const booleanEnv = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

// Blank values count as "not set" so production cannot slip through with an empty variable.
const blankAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, "").toLowerCase();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_ORIGIN: z.preprocess(blankAsUndefined, z.string().url().optional()),

    MONGODB_URI: z.preprocess(blankAsUndefined, z.string().min(1).optional()),
    JWT_ACCESS_SECRET: z.preprocess(blankAsUndefined, z.string().min(32).optional()),

    // Organization whose published rhythms, professors and classes the public website shows.
    PUBLIC_ORGANIZATION_SLUG: z.string().trim().min(1).default("mym-academia"),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),

    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),

    SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_SECURE: booleanEnv,
    SMTP_USER: z.string().email().optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM_NAME: z.string().min(1).default("M&M Academia")
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;

    // Messages must never echo the received values (the JWT secret in particular).
    if (value.JWT_ACCESS_SECRET === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET is required in production"
      });
    } else if (
      value.JWT_ACCESS_SECRET.trim() === DEV_JWT_ACCESS_SECRET ||
      value.JWT_ACCESS_SECRET.trim() === PLACEHOLDER_JWT_ACCESS_SECRET
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message: "JWT_ACCESS_SECRET must not be a development or placeholder value in production"
      });
    }

    if (value.MONGODB_URI === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_URI"],
        message: "MONGODB_URI is required in production"
      });
    } else if (value.MONGODB_URI.trim() === DEV_MONGODB_URI) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_URI"],
        message: "MONGODB_URI must not be the local development database in production"
      });
    }

    if (value.APP_ORIGIN === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "APP_ORIGIN is required in production"
      });
    } else if (normalizeOrigin(value.APP_ORIGIN) === normalizeOrigin(DEV_APP_ORIGIN)) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "APP_ORIGIN must not be the local development origin in production"
      });
    }
  })
  .transform((value) => ({
    ...value,
    APP_ORIGIN: value.APP_ORIGIN ?? DEV_APP_ORIGIN,
    MONGODB_URI: value.MONGODB_URI ?? DEV_MONGODB_URI,
    JWT_ACCESS_SECRET: value.JWT_ACCESS_SECRET ?? DEV_JWT_ACCESS_SECRET
  }));

export type Env = z.output<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(input);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `- ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}
