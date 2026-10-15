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
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    // Vercel places the Function behind one trusted proxy. Keep this explicit so
    // the rate limiter keys requests from the platform-provided client address,
    // not an arbitrary X-Forwarded-For value supplied directly to the app.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).optional(),

    // Conservative Atlas M0 defaults. A warm Vercel instance shares this pool
    // across concurrent requests; minPoolSize stays at zero so idle instances do
    // not reserve database connections.
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(20).default(5),
    MONGODB_MIN_POOL_SIZE: z.coerce.number().int().min(0).max(20).default(0),
    MONGODB_MAX_CONNECTING: z.coerce.number().int().min(1).max(20).default(2),
    MONGODB_MAX_IDLE_TIME_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
    MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
    MONGODB_WAIT_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(5_000),

    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),

    SMTP_HOST: z.string().min(1).default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_SECURE: booleanEnv,
    SMTP_USER: z.string().email().optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM_NAME: z.string().min(1).default("M&M Academia"),

    // Shared secret of the scheduled daily job (Vercel Cron sends it as a Bearer token).
    CRON_SECRET: z.preprocess(blankAsUndefined, z.string().min(16).optional())
  })
  .superRefine((value, ctx) => {
    if (value.MONGODB_MIN_POOL_SIZE > value.MONGODB_MAX_POOL_SIZE) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_MIN_POOL_SIZE"],
        message: "MONGODB_MIN_POOL_SIZE must not exceed MONGODB_MAX_POOL_SIZE"
      });
    }

    if (value.MONGODB_MAX_CONNECTING > value.MONGODB_MAX_POOL_SIZE) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_MAX_CONNECTING"],
        message: "MONGODB_MAX_CONNECTING must not exceed MONGODB_MAX_POOL_SIZE"
      });
    }

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
    JWT_ACCESS_SECRET: value.JWT_ACCESS_SECRET ?? DEV_JWT_ACCESS_SECRET,
    TRUST_PROXY_HOPS: value.TRUST_PROXY_HOPS ?? (value.NODE_ENV === "production" ? 1 : 0)
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
