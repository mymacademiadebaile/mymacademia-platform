/**
 * Public contracts for the marketing site.
 *
 * These types describe ONLY what is safe to show publicly. They are intentionally
 * decoupled from the internal models (User, Professor, DanceClass, ClassSession,
 * CatalogItem) so the future `/public/*` API can project into them without leaking
 * emails, private phones, students, payments or enrollments.
 */

/** Mirrors `WEEK_DAYS` from `@mym/shared`, kept local so the web app does not depend on it. */
export type WeekDay =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export interface PublicImage {
  src: string;
  alt: string;
  /** Intrinsic size when known. Components render with `fill`, so it is optional. */
  width?: number;
  height?: number;
  /** CSS object-position used to keep the subject inside editorial crops. */
  focus?: string;
  /** True while the image is a temporary stock photo (see docs/public-landing.md). */
  isPlaceholder?: boolean;
  credit?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
  /** True when the answer is not confirmed by the academy yet. */
  isPlaceholder?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  streetAddress: string;
  betweenStreets: string;
  locality: string;
  region: string;
  country: string;
  countryCode: string;
  /** Only set once confirmed. */
  postalCode?: string;
  /** Only set once coordinates are verified on site. */
  geo?: { latitude: number; longitude: number };
  /** Text used for Google Maps search / embed / directions. */
  mapsQuery: string;
}

/** Future source: CatalogItem (type DISCIPLINE) + public editorial fields. */
export interface DanceStyle {
  id: string;
  slug: string;
  /** Slug of the SEO landing page: /clases/[seoSlug]. */
  seoSlug: string;
  name: string;
  /** Short editorial line shown on cards. */
  tagline: string;
  /** Longer, factual description for the style page. */
  description: string[];
  image: PublicImage;
  levels: string[];
  professorSlugs: string[];
  faq: FaqItem[];
  /** True while copy has not been approved by the academy. */
  isPlaceholderCopy: boolean;
}

/** Future source: Professor, projected to public fields only. */
export interface PublicProfessor {
  id: string;
  slug: string;
  displayName: string;
  /** Used for the two-line editorial name. */
  firstName: string;
  lastName?: string;
  /** DanceStyle slugs. */
  disciplines: string[];
  /** One-liner for cards. */
  bioShort: string;
  /** Full biography, one entry per paragraph. */
  bio: string[];
  avatar: PublicImage;
  instagram?: string;
  promoVideoUrl?: string;
  /** Mock profiles must not be indexed nor described with Person JSON-LD. */
  isPlaceholder: boolean;
}

/** Future source: DanceClass (public fields only: no prices, capacity or billing). */
export interface PublicClass {
  id: string;
  name: string;
  styleSlug: string;
  professorSlugs: string[];
  levels: string[];
  branchId: string;
}

/** Future source: DanceClass.schedules[]. */
export interface PublicScheduleSlot {
  id: string;
  classId: string;
  day: WeekDay;
  /** "HH:mm", academy local time (America/Argentina/Buenos_Aires). */
  startTime: string;
  endTime: string;
}

export interface PublicSchedule {
  slots: PublicScheduleSlot[];
  isPlaceholder: boolean;
}

/** Resolved row ready for presentation. */
export interface ScheduleEntry {
  slotId: string;
  /** Groups the weekly slots that belong to the same class. */
  classId: string;
  day: WeekDay;
  startTime: string;
  endTime: string;
  className: string;
  /** Primary rhythm of the class. */
  style: Pick<DanceStyle, "slug" | "seoSlug" | "name">;
  /** Every published rhythm the class belongs to (includes the primary one). */
  styleSlugs: string[];
  professors: Pick<PublicProfessor, "slug" | "displayName">[];
  levels: string[];
}

/** Future source: ClassSession (upcoming, not cancelled). */
export interface UpcomingClass {
  entry: ScheduleEntry;
  /** ISO date (yyyy-mm-dd) in academy local time. */
  date: string;
  /** 0 = today, 1 = tomorrow… */
  daysFromToday: number;
}
