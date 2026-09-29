import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { BranchModel } from "../core/branch.model";
import { objectIdSchema } from "./admin.schemas";

const branchSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().max(180).optional().or(z.literal(""))
});

const updateBranchSchema = branchSchema.partial().extend({
  isActive: z.boolean().optional()
});

export const adminBranchesRouter = Router();

adminBranchesRouter.get("/", async (request, response, next) => {
  try {
    const branches = await BranchModel.find({
      organizationId: request.auth!.organizationId
    }).sort({ name: 1 });

    response.json(branches);
  } catch (error) {
    next(error);
  }
});

adminBranchesRouter.post("/", async (request, response, next) => {
  try {
    const input = branchSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const duplicate = await BranchModel.exists({
      organizationId,
      name: input.name
    });

    if (duplicate) {
      throw new AppError(409, "Ya existe una sede con ese nombre", "BRANCH_ALREADY_EXISTS");
    }

    const branch = await BranchModel.create({
      organizationId,
      name: input.name,
      address: input.address?.trim() || undefined,
      isActive: true
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "BRANCH_CREATED",
      entityType: "Branch",
      entityId: branch._id,
      metadata: {
        name: branch.name,
        address: branch.address ?? ""
      }
    });

    response.status(201).json(branch);
  } catch (error) {
    next(error);
  }
});

adminBranchesRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateBranchSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const branch = await BranchModel.findOne({
      _id: id,
      organizationId
    });

    if (!branch) {
      throw new AppError(404, "Sede no encontrada", "BRANCH_NOT_FOUND");
    }

    if (input.name && input.name !== branch.name) {
      const duplicate = await BranchModel.exists({
        organizationId,
        name: input.name,
        _id: { $ne: branch._id }
      });

      if (duplicate) {
        throw new AppError(409, "Ya existe una sede con ese nombre", "BRANCH_ALREADY_EXISTS");
      }
    }

    const before = {
      name: branch.name,
      address: branch.address ?? "",
      isActive: branch.isActive
    };

    if (input.name !== undefined) branch.name = input.name;
    if (input.address !== undefined) branch.address = input.address.trim() || undefined;
    if (input.isActive !== undefined) branch.isActive = input.isActive;

    await branch.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "BRANCH_UPDATED",
      entityType: "Branch",
      entityId: branch._id,
      metadata: {
        before,
        after: {
          name: branch.name,
          address: branch.address ?? "",
          isActive: branch.isActive
        }
      }
    });

    response.json(branch);
  } catch (error) {
    next(error);
  }
});
