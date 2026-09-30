/**
 * Reads the published catalog from the read-only public API (GET /api/public/catalog)
 * and maps it to the website types. Server-side only: pages are rendered on the
 * server and the response is kept in the Next data cache for `REVALIDATE_SECONDS`,
 * so an admin change shows up within about a minute.
 */
import type { DanceStyle, PublicProfessor, ScheduleEntry, WeekDay } from "./types";

export const REVALIDATE_SECONDS = 60;

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/+$/, "");

interface ApiImage {
  src: string;
  width?: number;
  height?: number;
}

interface ApiCatalog {
  styles: {
    slug: string;
    name: string;
    tagline: string;
    description: string[];
    image: ApiImage;
    levels: string[];
    professorSlugs: string[];
  }[];
  professors: {
    slug: string;
    displayName: string;
    firstName: string;
    lastName?: string;
    bioShort: string;
    bio: string[];
    avatar: ApiImage;
    instagram?: string;
    promoVideoUrl?: string;
    disciplines: string[];
  }[];
  schedule: {
    slotId: string;
    classId: string;
    day: string;
    startTime: string;
    endTime: string;
    className: string;
    style: { slug: string; name: string };
    styleSlugs: string[];
    professors: { slug: string; displayName: string }[];
    levels: string[];
  }[];
}

export interface PublicCatalog {
  styles: DanceStyle[];
  professors: PublicProfessor[];
  entries: ScheduleEntry[];
}

/** Public URL of a rhythm page: /clases/{seoSlug}. */
export function seoSlugFor(slug: string): string {
  return `${slug}-la-plata`;
}

export function mapCatalog(data: ApiCatalog): PublicCatalog {
  const styles: DanceStyle[] = data.styles.map((style) => ({
    id: style.slug,
    slug: style.slug,
    seoSlug: seoSlugFor(style.slug),
    name: style.name,
    tagline: style.tagline,
    description: style.description,
    image: {
      ...style.image,
      alt: `${style.name} en M&M Academia de Baile, La Plata`,
      focus: "50% 35%"
    },
    levels: style.levels,
    professorSlugs: style.professorSlugs,
    faq: [],
    isPlaceholderCopy: false
  }));

  const professors: PublicProfessor[] = data.professors.map((professor) => ({
    id: professor.slug,
    slug: professor.slug,
    displayName: professor.displayName,
    firstName: professor.firstName,
    lastName: professor.lastName,
    disciplines: professor.disciplines,
    bioShort: professor.bioShort,
    bio: professor.bio,
    avatar: {
      ...professor.avatar,
      alt: `${professor.displayName}, profesor/a de baile en M&M Academia de Baile`,
      focus: "50% 25%"
    },
    instagram: professor.instagram,
    promoVideoUrl: professor.promoVideoUrl,
    isPlaceholder: false
  }));

  const seoBySlug = new Map(styles.map((style) => [style.slug, style.seoSlug]));
  const entries: ScheduleEntry[] = data.schedule.map((entry) => ({
    slotId: entry.slotId,
    classId: entry.classId,
    day: entry.day as WeekDay,
    startTime: entry.startTime,
    endTime: entry.endTime,
    className: entry.className,
    style: {
      slug: entry.style.slug,
      name: entry.style.name,
      seoSlug: seoBySlug.get(entry.style.slug) ?? seoSlugFor(entry.style.slug)
    },
    styleSlugs: entry.styleSlugs,
    professors: entry.professors,
    levels: entry.levels
  }));

  return { styles, professors, entries };
}

export async function fetchCatalogFromApi(): Promise<PublicCatalog> {
  const response = await fetch(`${API_URL}/public/catalog`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: ["public-catalog"] }
  });
  if (!response.ok) {
    throw new Error(`Public API responded ${response.status}`);
  }
  return mapCatalog((await response.json()) as ApiCatalog);
}
