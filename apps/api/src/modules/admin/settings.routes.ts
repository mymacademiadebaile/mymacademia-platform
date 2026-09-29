import { Router } from "express";
import { z } from "zod";
import { OrganizationModel } from "../core/organization.model";
import { BranchModel } from "../core/branch.model";

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  timezone: z.string().trim().min(3).max(80).default("America/Argentina/Buenos_Aires"),
  primaryBranch: z.object({
    name: z.string().trim().min(2).max(100),
    address: z.string().trim().max(180).optional()
  }).optional()
});

export const adminSettingsRouter = Router();

adminSettingsRouter.get("/", async (request, response, next) => {
  try {
    const [organization, branches] = await Promise.all([
      OrganizationModel.findById(request.auth!.organizationId),
      BranchModel.find({ organizationId: request.auth!.organizationId }).sort({ createdAt: 1 })
    ]);

    if (!organization) {
      response.status(404).json({ error: "ORGANIZATION_NOT_FOUND" });
      return;
    }

    response.json({
      organization,
      primaryBranch: branches[0] ?? null,
      branches
    });
  } catch (error) {
    next(error);
  }
});

adminSettingsRouter.put("/", async (request, response, next) => {
  try {
    const input = updateSettingsSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const organization = await OrganizationModel.findByIdAndUpdate(
      organizationId,
      {
        $set: {
          name: input.name,
          email: input.email || undefined,
          phone: input.phone,
          timezone: input.timezone
        }
      },
      { new: true }
    );

    if (!organization) {
      response.status(404).json({ error: "ORGANIZATION_NOT_FOUND" });
      return;
    }

    let primaryBranch = await BranchModel.findOne({ organizationId }).sort({ createdAt: 1 });

    if (input.primaryBranch) {
      if (primaryBranch) {
        primaryBranch = await BranchModel.findByIdAndUpdate(
          primaryBranch._id,
          { $set: input.primaryBranch },
          { new: true }
        );
      } else {
        primaryBranch = await BranchModel.create({
          organizationId,
          ...input.primaryBranch,
          isActive: true
        });
      }
    }

    response.json({ organization, primaryBranch });
  } catch (error) {
    next(error);
  }
});
