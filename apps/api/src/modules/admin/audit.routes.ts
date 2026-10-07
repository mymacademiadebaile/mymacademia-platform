import { Router } from "express";
import { containsText } from "../../common/regex";
import { z } from "zod";
import { AuditLogModel } from "../audit/audit-log.model";
import { pageQuerySchema } from "./admin.schemas";

const auditQuerySchema = pageQuerySchema.extend({
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(80).optional()
});

export const adminAuditRouter = Router();

adminAuditRouter.get("/", async (request, response, next) => {
  try {
    const query = auditQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };

    if (query.action) {
      filter.action = containsText(query.action);
    }

    if (query.entityType) {
      filter.entityType = query.entityType;
    }

    if (query.q) {
      filter.$or = [
        { action: containsText(query.q) },
        { entityType: containsText(query.q) }
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      AuditLogModel.find(filter)
        .populate("actorUserId", "firstName lastName email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit),
      AuditLogModel.countDocuments(filter)
    ]);

    response.json({
      items,
      total,
      page: query.page,
      limit: query.limit
    });
  } catch (error) {
    next(error);
  }
});
