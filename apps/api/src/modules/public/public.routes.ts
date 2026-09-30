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
let organizationCache: { id: string; expiresAt: number } | undefined;
let catalogCache: { value: PublicCatalogDto; expiresAt: number } | undefined;

async function resolveOrganizationId(): Promise<string> {
  if (organizationCache && organizationCache.expiresAt > Date.now()) return organizationCache.id;

  const organization = await OrganizationModel.findOne({
    slug: env.PUBLIC_ORGANIZATION_SLUG,
    isActive: true
  }).select("_id");
  if (!organization) {
    throw new AppError(404, "Organización pública no encontrada", "PUBLIC_ORGANIZATION_NOT_FOUND");
  }

  organizationCache = { id: organization.id, expiresAt: Date.now() + 5 * CACHE_TTL_MS };
  return organization.id;
}

export function resetPublicCatalogCache() {
  organizationCache = undefined;
  catalogCache = undefined;
}

export async function loadPublicCatalog(): Promise<PublicCatalogDto> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;

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

  const value = buildPublicCatalog({ rhythms, levels, professors, classes });
  catalogCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
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
