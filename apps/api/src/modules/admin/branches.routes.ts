import { Router } from "express";
import { z } from "zod";
import { BranchModel } from "../core/branch.model";
import { objectIdSchema } from "./admin.schemas";

const branchSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().max(180).optional()
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
    const branch = await BranchModel.create({
      organizationId: request.auth!.organizationId,
      ...input,
      isActive: true
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

    const branch = await BranchModel.findOneAndUpdate(
      { _id: id, organizationId: request.auth!.organizationId },
      { $set: input },
      { new: true }
    );

    if (!branch) {
      response.status(404).json({ error: "BRANCH_NOT_FOUND" });
      return;
    }

    response.json(branch);
  } catch (error) {
    next(error);
  }
});
