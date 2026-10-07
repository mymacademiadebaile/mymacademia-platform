export const USER_ROLES = ["SUPER_ADMIN", "ADMIN", "PROFESSOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CATALOG_TYPES = ["DISCIPLINE", "SEGMENT", "LEVEL"] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "OVERDUE", "CANCELLED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_TYPES = ["PER_CLASS", "MONTHLY"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const BILLING_MODES = ["PER_CLASS", "MONTHLY", "BOTH", "FREE"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

/**
 * Group (class) lifecycle. PAUSED stops generating regular sessions while a pause lasts;
 * ARCHIVED keeps history but blocks new enrollments and schedules. INACTIVE is the legacy
 * name of ARCHIVED and is still accepted when reading old documents.
 */
export const CLASS_STATUSES = ["ACTIVE", "INACTIVE", "PAUSED", "ARCHIVED"] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export const SESSION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "SUSPENDED",
  "RESCHEDULED",
  "CANCELLED"
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_ORIGINS = ["REGULAR", "EXTRA", "RESCHEDULED"] as const;
export type SessionOrigin = (typeof SESSION_ORIGINS)[number];

export const CHARGE_KINDS = ["MONTHLY_FEE", "CLASS_FEE", "OTHER"] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

export const COLLECTION_METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;
export type CollectionMethod = (typeof COLLECTION_METHODS)[number];

export const ADJUSTMENT_TYPES = ["DISCOUNT", "SURCHARGE", "CREDIT_TRANSFER", "WRITE_OFF"] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const MID_MONTH_POLICIES = ["FULL", "PRORATED", "CUSTOM"] as const;
export type MidMonthPolicy = (typeof MID_MONTH_POLICIES)[number];

export const WEEK_DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY"
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
