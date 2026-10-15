/**
 * Reads the published catalog from the read-only public API (GET /api/public/catalog)
 * and maps it to the website types. Server-side only: pages are rendered on the
 * server and the response is kept in the Next data cache for `REVALIDATE_SECONDS`,
 * so an admin change shows up within about a minute. The public layout is dynamic
 * to keep deployments independent from API availability at build time, therefore
 * these reads use unstable_cache instead of per-fetch revalidation.
 */
import { unstable_cache } from "next/cache";
import type { DanceStyle, PublicProfessor, PublicSocialLinks, ScheduleEntry, WeekDay } from "./types";

export const REVALIDATE_SECONDS = 60;

// Browser requests use the same-origin `/api` path. Server components instead
// use Vercel's private service binding when it is available, because Node's
// fetch requires an absolute URL. The local development fallback stays intact.
const API_URL = (
  process.env.API_INTERNAL_URL
    ? `${process.env.API_INTERNAL_URL.replace(/\/+$/, "")}/api`
    : process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"
).replace(/\/+$/, "");

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

async function fetchCatalogUncached(): Promise<PublicCatalog> {
  const response = await fetch(`${API_URL}/public/catalog`, {
    // The enclosing Next data-cache entry owns caching and revalidation. This
    // must remain no-store because force-dynamic otherwise overrides fetch
    // caching in Next 16's previous cache model.
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Public API responded ${response.status}`);
  }
  return mapCatalog((await response.json()) as ApiCatalog);
}

const fetchCachedCatalog = unstable_cache(fetchCatalogUncached, ["public-catalog-v1"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["public-catalog"]
});

export async function fetchCatalogFromApi(): Promise<PublicCatalog> {
  return fetchCachedCatalog();
}

/** Links shown in the public footer; the API only returns configured, safe social URLs. */
async function fetchPublicSocialLinksUncached(): Promise<PublicSocialLinks> {
  const response = await fetch(`${API_URL}/public/social-links`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Public social links API responded ${response.status}`);
  }
  return (await response.json()) as PublicSocialLinks;
}

const fetchCachedPublicSocialLinks = unstable_cache(fetchPublicSocialLinksUncached, ["public-social-links-v1"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["public-social-links"]
});

export async function fetchPublicSocialLinksFromApi(): Promise<PublicSocialLinks> {
  return fetchCachedPublicSocialLinks();
}

interface ApiSiteImages {
  academySpace: Partial<Record<"tall" | "wide" | "detail", { src: string; width?: number; height?: number }>>;
}

async function fetchPublicSiteImagesUncached(): Promise<ApiSiteImages> {
  const response = await fetch(`${API_URL}/public/site-images`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Public site images API responded ${response.status}`);
  }
  return (await response.json()) as ApiSiteImages;
}

const fetchCachedPublicSiteImages = unstable_cache(fetchPublicSiteImagesUncached, ["public-site-images-v1"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["public-site-images"]
});

export async function fetchPublicSiteImagesFromApi(): Promise<ApiSiteImages> {
  return fetchCachedPublicSiteImages();
}
