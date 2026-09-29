import { Router } from "express";
import { z } from "zod";
import { CATALOG_TYPES } from "@mym/shared";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { objectIdSchema } from "./admin.schemas";

const createCatalogSchema = z.object({
  type: z.enum(CATALOG_TYPES),
  name: z.string().trim().min(2).max(80),
  sortOrder: z.number().int().min(0).default(0)
});

const updateCatalogSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase("es-AR");
}

export const adminCatalogsRouter = Router();

adminCatalogsRouter.get("/", async (request, response, next) => {
  try {
    const items = await CatalogItemModel.find({
      organizationId: request.auth!.organizationId
    }).sort({ type: 1, sortOrder: 1, name: 1 });

    response.json(items);
  } catch (error) {
    next(error);
  }
});

adminCatalogsRouter.post("/", async (request, response, next) => {
  try {
    const input = createCatalogSchema.parse(request.body);
    const item = await CatalogItemModel.create({
      organizationId: request.auth!.organizationId,
      ...input,
      normalizedName: normalizeName(input.name),
      isActive: true
    });

    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

adminCatalogsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateCatalogSchema.parse(request.body);
    const update = {
      ...input,
      ...(input.name ? { normalizedName: normalizeName(input.name) } : {})
    };

    const item = await CatalogItemModel.findOneAndUpdate(
      { _id: id, organizationId: request.auth!.organizationId },
      { $set: update },
      { new: true }
    );

    if (!item) {
      response.status(404).json({ error: "CATALOG_NOT_FOUND" });
      return;
    }

    response.json(item);
  } catch (error) {
    next(error);
  }
});
