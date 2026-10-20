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

export interface PublicSocialLinksDto {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  youtube?: string;
}

export interface PublicSiteImagesDto {
  academySpace: Partial<Record<"tall" | "wide" | "detail", { src: string; width?: number; height?: number }>>;
}

async function resolveOrganizationId(): Promise<string> {
  const organization = await OrganizationModel.findOne({
    slug: env.PUBLIC_ORGANIZATION_SLUG,
    isActive: true
  }).select("_id");
  if (!organization) {
    throw new AppError(404, "Organización pública no encontrada", "PUBLIC_ORGANIZATION_NOT_FOUND");
  }
  return organization.id;
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
}

export async function loadPublicCatalog(): Promise<PublicCatalogDto> {
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
}

/** Public-only projection of editorial photos configured in the backoffice. */
export async function loadPublicSiteImages(): Promise<PublicSiteImagesDto> {
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
}

publicRouter.use((_request, response, next) => {
  // Public editorial updates must be observable on the following request.
  response.setHeader("Cache-Control", "no-store, max-age=0");
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
