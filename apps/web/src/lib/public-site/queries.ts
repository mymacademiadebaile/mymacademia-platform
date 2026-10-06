/**
 * Data access for the public site. Components and pages only talk to these functions.
 *
 * Source of truth is the public API (`/api/public/catalog`): only rhythms, professors
 * and classes the admin published. Set `PUBLIC_DATA_SOURCE=mock` to work on the site
 * without a backend (fictional content from `mock-data.ts`).
 *
 * If the API is unreachable the site still renders: sections without data are hidden
 * and the next request retries (failed fetches are never cached).
 */
import { cache } from "react";
import {
  fetchCatalogFromApi,
  fetchPublicSiteImagesFromApi,
  fetchPublicSocialLinksFromApi,
  type PublicCatalog
} from "./api-source";
import { buildFaq } from "./faq";
import {
  mockClasses,
  mockDanceStyles,
  mockImages,
  mockProfessors,
  mockSchedule
} from "./mock-data";
import { resolveSchedule, upcomingFromSchedule } from "./schedule-utils";
import { PRIMARY_BRANCH, SITE } from "./site";
import type { Branch, DanceStyle, FaqItem, PublicImage, PublicProfessor, PublicSocialLinks, ScheduleEntry, UpcomingClass } from "./types";

const USE_MOCK = process.env.PUBLIC_DATA_SOURCE === "mock";

const EMPTY_CATALOG: PublicCatalog = { styles: [], professors: [], entries: [] };

/** One catalog load per request (React cache dedupes the parallel calls of a page). */
const loadCatalog = cache(async (): Promise<PublicCatalog & { isPlaceholder: boolean }> => {
  if (USE_MOCK) {
    return {
      styles: mockDanceStyles,
      professors: mockProfessors,
      entries: resolveSchedule(mockSchedule.slots, mockClasses, mockDanceStyles, mockProfessors),
      isPlaceholder: true
    };
  }

  try {
    return { ...(await fetchCatalogFromApi()), isPlaceholder: false };
  } catch (error) {
    console.error("[public-site] could not load the public catalog", error);
    return { ...EMPTY_CATALOG, isPlaceholder: false };
  }
});

export async function fetchPublicDanceStyles(): Promise<DanceStyle[]> {
  return (await loadCatalog()).styles;
}

export async function fetchPublicDanceStyle(seoSlug: string): Promise<DanceStyle | undefined> {
  return (await fetchPublicDanceStyles()).find((style) => style.seoSlug === seoSlug);
}

export async function fetchPublicProfessors(): Promise<PublicProfessor[]> {
  return (await loadCatalog()).professors;
}

export async function fetchPublicProfessor(slug: string): Promise<PublicProfessor | undefined> {
  return (await fetchPublicProfessors()).find((professor) => professor.slug === slug);
}

export async function fetchPublicSchedule(): Promise<{ entries: ScheduleEntry[]; isPlaceholder: boolean }> {
  const { entries, isPlaceholder } = await loadCatalog();
  return { entries, isPlaceholder };
}

/** Next classes derived from the weekly schedule (sessions are created on demand in the backoffice). */
export async function fetchUpcomingClasses(limit = 3, now = new Date()): Promise<UpcomingClass[]> {
  const { entries } = await fetchPublicSchedule();
  return upcomingFromSchedule(entries, now, SITE.timeZone, limit);
}

export async function fetchPrimaryBranch(): Promise<Branch> {
  return PRIMARY_BRANCH;
}

export async function fetchPublicSocialLinks(): Promise<PublicSocialLinks> {
  if (USE_MOCK) return {};

  try {
    return await fetchPublicSocialLinksFromApi();
  } catch (error) {
    console.error("[public-site] could not load public social links", error);
    return {};
  }
}

export async function fetchPublicFaq(): Promise<FaqItem[]> {
  return buildFaq((await fetchPublicDanceStyles()).map((style) => style.name));
}

/** Editorial home photos. The salon collage can be replaced from Settings. */
export async function fetchSiteImages(): Promise<Record<keyof typeof mockImages, PublicImage>> {
  if (USE_MOCK) return mockImages;

  try {
    const configured = await fetchPublicSiteImagesFromApi();
    const makeImage = (
      image: { src: string; width?: number; height?: number } | undefined,
      fallback: PublicImage,
      alt: string
    ) => image
      ? { ...fallback, ...image, alt, isPlaceholder: false, credit: undefined }
      : fallback;

    return {
      ...mockImages,
      spaceBarre: makeImage(
        configured.academySpace.tall,
        mockImages.spaceBarre,
        "Salón de M&M Academia de Baile"
      ),
      spaceGroup: makeImage(
        configured.academySpace.wide,
        mockImages.spaceGroup,
        "Clase en el salón de M&M Academia de Baile"
      ),
      spaceClass: makeImage(
        configured.academySpace.detail,
        mockImages.spaceClass,
        "Detalle del salón de M&M Academia de Baile"
      )
    };
  } catch (error) {
    console.error("[public-site] could not load configured site images", error);
    return mockImages;
  }
}
