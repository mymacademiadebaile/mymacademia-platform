import { Router } from "express";
import { z } from "zod";
import { CATALOG_TYPES, type CatalogType } from "@mym/shared";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { ProfessorModel } from "../professors/professor.model";
import { objectIdSchema } from "./admin.schemas";

const createCatalogSchema = z.object({
  type: z.enum(CATALOG_TYPES),
  name: z.string().trim().min(2).max(80),
  sortOrder: z.number().int().min(0).default(0)
});

const updateCatalogSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  confirmInUse: z.boolean().optional().default(false)
});

const reorderCatalogSchema = z.object({
  type: z.enum(CATALOG_TYPES),
  orderedIds: z.array(objectIdSchema).min(1).max(200)
});

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase("es-AR");
}

function classUsageFilter(type: CatalogType, id: string) {
  const field = {
    DISCIPLINE: "disciplineIds",
    SEGMENT: "segmentIds",
    LEVEL: "levelIds"
  }[type];

  return { [field]: id };
}

async function getUsage(organizationId: string, type: CatalogType, id: string) {
  const [classes, professors] = await Promise.all([
    DanceClassModel.countDocuments({
      organizationId,
      ...classUsageFilter(type, id)
    }),
    type === "DISCIPLINE"
      ? ProfessorModel.countDocuments({
          organizationId,
          disciplineIds: id
        })
      : Promise.resolve(0)
  ]);

  return {
    classes,
    professors,
    total: classes + professors
  };
}

export const adminCatalogsRouter = Router();

adminCatalogsRouter.get("/", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const items = await CatalogItemModel.find({
      organizationId
    }).sort({ type: 1, sortOrder: 1, name: 1 });

    const result = await Promise.all(
      items.map(async (item) => ({
        ...item.toObject(),
        usage: await getUsage(organizationId, item.type, item.id)
      }))
    );

    response.json(result);
  } catch (error) {
    next(error);
  }
});

adminCatalogsRouter.post("/", async (request, response, next) => {
  try {
    const input = createCatalogSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const normalizedName = normalizeName(input.name);

    const duplicate = await CatalogItemModel.exists({
      organizationId,
      type: input.type,
      normalizedName
    });

    if (duplicate) {
      throw new AppError(
        409,
        "Ya existe una opción con ese nombre en este catálogo",
        "CATALOG_ALREADY_EXISTS"
      );
    }

    const item = await CatalogItemModel.create({
      organizationId,
      ...input,
      normalizedName,
      isActive: true
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CATALOG_CREATED",
      entityType: "CatalogItem",
      entityId: item._id,
      metadata: {
        type: item.type,
        name: item.name,
        sortOrder: item.sortOrder
      }
    });

    response.status(201).json({
      ...item.toObject(),
      usage: { classes: 0, professors: 0, total: 0 }
    });
  } catch (error) {
    next(error);
  }
});

adminCatalogsRouter.post("/reorder", async (request, response, next) => {
  try {
    const input = reorderCatalogSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const items = await CatalogItemModel.find({
      organizationId,
      type: input.type,
      _id: { $in: input.orderedIds }
    }).select("_id");

    if (items.length !== input.orderedIds.length) {
      throw new AppError(
        422,
        "El orden contiene opciones inválidas o de otro catálogo",
        "INVALID_CATALOG_ORDER"
      );
    }

    await CatalogItemModel.bulkWrite(
      input.orderedIds.map((id, index) => ({
        updateOne: {
          filter: { _id: id, organizationId, type: input.type },
          update: { $set: { sortOrder: index } }
        }
      }))
    );

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CATALOG_REORDERED",
      entityType: "CatalogItem",
      metadata: {
        type: input.type,
        orderedIds: input.orderedIds
      }
    });

    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminCatalogsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateCatalogSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const item = await CatalogItemModel.findOne({
      _id: id,
      organizationId
    });

    if (!item) {
      throw new AppError(404, "Opción de catálogo no encontrada", "CATALOG_NOT_FOUND");
    }

    if (input.name !== undefined) {
      const normalizedName = normalizeName(input.name);

      if (normalizedName !== item.normalizedName) {
        const duplicate = await CatalogItemModel.exists({
          organizationId,
          type: item.type,
          normalizedName,
          _id: { $ne: item._id }
        });

        if (duplicate) {
          throw new AppError(
            409,
            "Ya existe una opción con ese nombre en este catálogo",
            "CATALOG_ALREADY_EXISTS"
          );
        }
      }
    }

    const usage = await getUsage(organizationId, item.type, item.id);

    if (
      input.isActive === false &&
      item.isActive &&
      usage.total > 0 &&
      !input.confirmInUse
    ) {
      throw new AppError(
        409,
        `Esta opción está en uso por ${usage.classes} clase(s)${usage.professors ? ` y ${usage.professors} profesor(es)` : ""}. Confirmá la desactivación para continuar.`,
        "CATALOG_IN_USE"
      );
    }

    const before = {
      name: item.name,
      normalizedName: item.normalizedName,
      sortOrder: item.sortOrder,
      isActive: item.isActive
    };

    if (input.name !== undefined) {
      item.name = input.name;
      item.normalizedName = normalizeName(input.name);
    }
    if (input.sortOrder !== undefined) item.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) item.isActive = input.isActive;

    await item.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CATALOG_UPDATED",
      entityType: "CatalogItem",
      entityId: item._id,
      metadata: {
        type: item.type,
        before,
        after: {
          name: item.name,
          normalizedName: item.normalizedName,
          sortOrder: item.sortOrder,
          isActive: item.isActive
        },
        usage
      }
    });

    response.json({
      ...item.toObject(),
      usage
    });
  } catch (error) {
    next(error);
  }
});
