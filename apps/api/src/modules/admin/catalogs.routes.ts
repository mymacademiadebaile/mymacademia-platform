import { Router } from "express";
import { z } from "zod";
import { CATALOG_TYPES, type CatalogType } from "@mym/shared";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { ProfessorModel } from "../professors/professor.model";
import { objectIdSchema } from "./admin.schemas";
import { slugify, uniqueSlug } from "../../common/slug";
import {
  deleteRhythmImage,
  rhythmImageUpload,
  uploadRhythmImage
} from "../../services/professor-media";
import { rhythmPublishIssues } from "../public/publish-rules";

const createCatalogSchema = z.object({
  type: z.enum(CATALOG_TYPES),
  name: z.string().trim().min(2).max(80),
  sortOrder: z.number().int().min(0).default(0)
});

const updateCatalogSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  confirmInUse: z.boolean().optional().default(false),
  // Public website fields (rhythms only).
  slug: z.string().trim().min(2).max(80).optional(),
  tagline: z.string().trim().max(160).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  publishOnWeb: z.boolean().optional()
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

    const touchesWebFields =
      input.slug !== undefined ||
      input.tagline !== undefined ||
      input.description !== undefined ||
      input.publishOnWeb !== undefined;

    if (touchesWebFields && item.type !== "DISCIPLINE") {
      throw new AppError(
        422,
        "Solo los ritmos tienen ficha en la web",
        "CATALOG_WEB_FIELDS_NOT_ALLOWED"
      );
    }

    const before = {
      name: item.name,
      normalizedName: item.normalizedName,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      slug: item.slug ?? "",
      tagline: item.tagline ?? "",
      description: item.description ?? "",
      publishOnWeb: item.publishOnWeb ?? false
    };

    if (input.name !== undefined) {
      item.name = input.name;
      item.normalizedName = normalizeName(input.name);
    }
    if (input.sortOrder !== undefined) item.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) item.isActive = input.isActive;
    if (input.tagline !== undefined) item.tagline = input.tagline.trim() || undefined;
    if (input.description !== undefined) item.description = input.description.trim() || undefined;
    if (input.publishOnWeb !== undefined) item.publishOnWeb = input.publishOnWeb;

    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (slug.length < 2) {
        throw new AppError(422, "La URL de la clase no es válida", "INVALID_SLUG");
      }
      const taken = await CatalogItemModel.exists({
        organizationId,
        type: item.type,
        slug,
        _id: { $ne: item._id }
      });
      if (taken) {
        throw new AppError(409, "Ya existe un ritmo con esa URL", "SLUG_ALREADY_EXISTS");
      }
      item.slug = slug;
    }

    if (input.publishOnWeb === true) {
      const issues = rhythmPublishIssues({
        isActive: item.isActive,
        tagline: item.tagline,
        image: item.image
      });

      if (issues.length > 0) {
        throw new AppError(
          422,
          `No se puede publicar en la web: ${issues.join(", ").toLocaleLowerCase("es-AR")}`,
          "RHYTHM_NOT_PUBLISHABLE"
        );
      }

      if (!item.slug) {
        item.slug = await uniqueSlug(item.name, async (candidate) =>
          Boolean(
            await CatalogItemModel.exists({
              organizationId,
              type: item.type,
              slug: candidate,
              _id: { $ne: item._id }
            })
          )
        );
      }
    }

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
          isActive: item.isActive,
          slug: item.slug ?? "",
          tagline: item.tagline ?? "",
          description: item.description ?? "",
          publishOnWeb: item.publishOnWeb ?? false
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

adminCatalogsRouter.post(
  "/:id/image",
  rhythmImageUpload.single("file"),
  async (request, response, next) => {
    try {
      const id = objectIdSchema.parse(request.params.id);
      const organizationId = request.auth!.organizationId;

      if (!request.file) {
        throw new AppError(422, "Seleccioná una imagen", "RHYTHM_IMAGE_REQUIRED");
      }

      const item = await CatalogItemModel.findOne({ _id: id, organizationId, type: "DISCIPLINE" });
      if (!item) {
        throw new AppError(404, "Ritmo no encontrado", "CATALOG_NOT_FOUND");
      }

      const result = await uploadRhythmImage(request.file.buffer, organizationId, item.id);
      item.image = { url: result.secure_url, width: result.width, height: result.height };
      await item.save();

      await AuditLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        action: "CATALOG_IMAGE_UPDATED",
        entityType: "CatalogItem",
        entityId: item._id,
        metadata: { name: item.name }
      });

      response.json({ image: item.image });
    } catch (error) {
      next(error);
    }
  }
);

adminCatalogsRouter.delete("/:id/image", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const item = await CatalogItemModel.findOne({ _id: id, organizationId, type: "DISCIPLINE" });
    if (!item) {
      throw new AppError(404, "Ritmo no encontrado", "CATALOG_NOT_FOUND");
    }

    await deleteRhythmImage(organizationId, item.id).catch(() => undefined);
    item.image = undefined;
    // Without an image the card cannot be shown, so it leaves the website.
    item.publishOnWeb = false;
    await item.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CATALOG_IMAGE_REMOVED",
      entityType: "CatalogItem",
      entityId: item._id,
      metadata: { name: item.name }
    });

    response.json({ image: null, publishOnWeb: false });
  } catch (error) {
    next(error);
  }
});
