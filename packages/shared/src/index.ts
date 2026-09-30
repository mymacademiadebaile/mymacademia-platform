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

export const CLASS_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

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
