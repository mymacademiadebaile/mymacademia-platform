import { Router } from "express";
import { AppError } from "../../common/http/app-error";
import { env } from "../../config/env";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { OrganizationModel } from "../core/organization.model";
import { ProfessorModel } from "../professors/professor.model";
import { buildPublicCatalog, type PublicCatalogDto } from "./public-projection";

/**
 * Read-only, unauthenticated endpoints for the marketing website.
 * Every query selects an explicit list of fields and the response is built by the
 * allow-list in public-projection.ts: no User, contact data, prices or students.
 */
export const publicRouter = Router();

const CACHE_TTL_MS = 60_000;
type TimedCache<T> = {
  value?: T;
  expiresAt?: number;
  pending?: Promise<T>;
};

let organizationCache: TimedCache<string> = {};
let catalogCache: TimedCache<PublicCatalogDto> = {};
let socialLinksCache: TimedCache<PublicSocialLinksDto> = {};
let siteImagesCache: TimedCache<PublicSiteImagesDto> = {};

export interface PublicSocialLinksDto {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  youtube?: string;
}

export interface PublicSiteImagesDto {
  academySpace: Partial<Record<"tall" | "wide" | "detail", { src: string; width?: number; height?: number }>>;
}

/**
 * Coalesce a cache miss within a warm API instance. The API is still safe when
 * Vercel creates multiple instances: the CDN and Next data cache protect those
 * cross-instance misses, while this avoids a local thundering herd.
 */
async function loadCached<T>(cache: TimedCache<T>, load: () => Promise<T>, ttlMs = CACHE_TTL_MS): Promise<T> {
  if (cache.value !== undefined && cache.expiresAt !== undefined && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  cache.pending ??= load()
    .then((value) => {
      cache.value = value;
      cache.expiresAt = Date.now() + ttlMs;
      return value;
    })
    .finally(() => {
      cache.pending = undefined;
    });

  return cache.pending;
}

async function resolveOrganizationId(): Promise<string> {
  return loadCached(
    organizationCache,
    async () => {
      const organization = await OrganizationModel.findOne({
        slug: env.PUBLIC_ORGANIZATION_SLUG,
        isActive: true
      }).select("_id");
      if (!organization) {
        throw new AppError(404, "Organización pública no encontrada", "PUBLIC_ORGANIZATION_NOT_FOUND");
      }
      return organization.id;
    },
    5 * CACHE_TTL_MS
  );
}

export function resetPublicCatalogCache() {
  organizationCache = {};
  catalogCache = {};
  resetPublicSocialLinksCache();
}

export function resetPublicSocialLinksCache() {
  socialLinksCache = {};
}

export function resetPublicSiteImagesCache() {
  siteImagesCache = {};
}

function safeSocialUrl(value: string | undefined, hosts: string[]): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase()) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Safe, explicitly allow-listed social profiles for the public footer. */
export async function loadPublicSocialLinks(): Promise<PublicSocialLinksDto> {
  return loadCached(socialLinksCache, async () => {
    const organizationId = await resolveOrganizationId();
    const organization = await OrganizationModel.findById(organizationId)
      .select("instagramUrl tiktokUrl facebookUrl youtubeUrl")
      .lean();

    const instagram = safeSocialUrl(organization?.instagramUrl, ["instagram.com", "www.instagram.com"]);
    const tiktok = safeSocialUrl(organization?.tiktokUrl, ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com"]);
    const facebook = safeSocialUrl(organization?.facebookUrl, ["facebook.com", "www.facebook.com", "m.facebook.com"]);
    const youtube = safeSocialUrl(organization?.youtubeUrl, ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

    return {
      ...(instagram ? { instagram } : {}),
      ...(tiktok ? { tiktok } : {}),
      ...(facebook ? { facebook } : {}),
      ...(youtube ? { youtube } : {})
    };
  });
}

export async function loadPublicCatalog(): Promise<PublicCatalogDto> {
  return loadCached(catalogCache, async () => {
    const organizationId = await resolveOrganizationId();

    const [rhythms, levels, professors, classes] = await Promise.all([
      CatalogItemModel.find({ organizationId, type: "DISCIPLINE", isActive: true, publishOnWeb: true })
        .select("type name isActive sortOrder slug tagline description image publishOnWeb")
        .lean(),
      CatalogItemModel.find({ organizationId, type: "LEVEL", isActive: true })
        .select("name isActive sortOrder")
        .lean(),
      ProfessorModel.find({ organizationId, isActive: true, publishOnWeb: true })
        .select("displayName isActive slug bioShort bio avatarUrl introVideoUrl instagram disciplineIds publishOnWeb")
        .lean(),
      DanceClassModel.find({ organizationId, status: "ACTIVE", publishOnWeb: { $ne: false } })
        .select("name status publishOnWeb professorIds disciplineIds levelIds schedules")
        .lean()
    ]);

    return buildPublicCatalog({ rhythms, levels, professors, classes });
  });
}

/** Public-only projection of editorial photos configured in the backoffice. */
export async function loadPublicSiteImages(): Promise<PublicSiteImagesDto> {
  return loadCached(siteImagesCache, async () => {
    const organizationId = await resolveOrganizationId();
    const organization = await OrganizationModel.findById(organizationId)
      .select("academySpaceImages")
      .lean();
    const source = organization?.academySpaceImages;
    const slots = ["tall", "wide", "detail"] as const;
    const academySpace = Object.fromEntries(
      slots.flatMap((slot) => {
        const image = source?.[slot];
        if (!image?.url) return [];
        const publicImage = {
          src: image.url,
          ...(image.width ? { width: image.width } : {}),
          ...(image.height ? { height: image.height } : {})
        };
        return [[slot, publicImage]];
      })
    ) as PublicSiteImagesDto["academySpace"];

    return { academySpace };
  });
}

publicRouter.use((_request, response, next) => {
  // Shared caches (CDN) may keep it briefly; the website also revalidates on its side.
  response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  next();
});

publicRouter.get("/catalog", async (_request, response, next) => {
  try {
    response.json(await loadPublicCatalog());
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/social-links", async (_request, response, next) => {
  try {
    response.json(await loadPublicSocialLinks());
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/site-images", async (_request, response, next) => {
  try {
    response.json(await loadPublicSiteImages());
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/styles", async (_request, response, next) => {
  try {
    response.json((await loadPublicCatalog()).styles);
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/professors", async (_request, response, next) => {
  try {
    response.json((await loadPublicCatalog()).professors);
  } catch (error) {
    next(error);
  }
});

publicRouter.get("/schedule", async (_request, response, next) => {
  try {
    response.json((await loadPublicCatalog()).schedule);
  } catch (error) {
    next(error);
  }
});
