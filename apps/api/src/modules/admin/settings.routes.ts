import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { OrganizationModel } from "../core/organization.model";
import { BranchModel } from "../core/branch.model";

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  inquiryContactName: z.string().trim().max(120).optional().or(z.literal("")),
  inquiryWhatsApp: z.string().trim().max(50).optional().or(z.literal("")),
  timezone: z.string().trim().min(3).max(80).default("America/Argentina/Buenos_Aires")
});

export const adminSettingsRouter = Router();

adminSettingsRouter.get("/", async (request, response, next) => {
  try {
    const [organization, branches] = await Promise.all([
      OrganizationModel.findById(request.auth!.organizationId),
      BranchModel.find({ organizationId: request.auth!.organizationId }).sort({ createdAt: 1 })
    ]);

    if (!organization) {
      throw new AppError(404, "Organización no encontrada", "ORGANIZATION_NOT_FOUND");
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
    const organization = await OrganizationModel.findById(organizationId);

    if (!organization) {
      throw new AppError(404, "Organización no encontrada", "ORGANIZATION_NOT_FOUND");
    }

    const before = {
      name: organization.name,
      email: organization.email ?? "",
      phone: organization.phone ?? "",
      inquiryContactName: organization.inquiryContactName ?? "",
      inquiryWhatsApp: organization.inquiryWhatsApp ?? "",
      timezone: organization.timezone ?? "America/Argentina/Buenos_Aires"
    };

    organization.name = input.name;
    organization.email = input.email || undefined;
    organization.phone = input.phone?.trim() || undefined;
    organization.inquiryContactName = input.inquiryContactName?.trim() || undefined;
    organization.inquiryWhatsApp = input.inquiryWhatsApp?.trim() || undefined;
    organization.timezone = input.timezone;
    await organization.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ORGANIZATION_SETTINGS_UPDATED",
      entityType: "Organization",
      entityId: organization._id,
      metadata: {
        before,
        after: {
          name: organization.name,
          email: organization.email ?? "",
          phone: organization.phone ?? "",
          inquiryContactName: organization.inquiryContactName ?? "",
          inquiryWhatsApp: organization.inquiryWhatsApp ?? "",
          timezone: organization.timezone ?? "America/Argentina/Buenos_Aires"
        }
      }
    });

    response.json({ organization });
  } catch (error) {
    next(error);
  }
});
