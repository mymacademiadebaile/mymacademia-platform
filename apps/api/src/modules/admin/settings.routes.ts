import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { OrganizationModel } from "../core/organization.model";
import { BranchModel } from "../core/branch.model";
import { resetPublicSocialLinksCache } from "../public/public.routes";

function socialUrlSchema(network: string, hosts: string[]) {
  return z
    .string()
    .trim()
    .max(500)
    .optional()
    .refine(
      (value) => {
        if (!value) return true;

        try {
          const url = new URL(value);
          return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase());
        } catch {
          return false;
        }
      },
      { message: `Ingresá una URL válida de ${network} que comience con https://` }
    );
}

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  inquiryContactName: z.string().trim().max(120).optional().or(z.literal("")),
  inquiryWhatsApp: z.string().trim().max(50).optional().or(z.literal("")),
  instagramUrl: socialUrlSchema("Instagram", ["instagram.com", "www.instagram.com"]),
  tiktokUrl: socialUrlSchema("TikTok", ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com"]),
  facebookUrl: socialUrlSchema("Facebook", ["facebook.com", "www.facebook.com", "m.facebook.com"]),
  youtubeUrl: socialUrlSchema("YouTube", ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]),
  timezone: z.string().trim().min(3).max(80).default("America/Argentina/Buenos_Aires"),
  cancellationNoticeHours: z.number().int().min(0).max(168).default(6)
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
      instagramUrl: organization.instagramUrl ?? "",
      tiktokUrl: organization.tiktokUrl ?? "",
      facebookUrl: organization.facebookUrl ?? "",
      youtubeUrl: organization.youtubeUrl ?? "",
      timezone: organization.timezone ?? "America/Argentina/Buenos_Aires",
      cancellationNoticeHours: organization.cancellationNoticeHours ?? 6
    };

    organization.name = input.name;
    organization.email = input.email || undefined;
    organization.phone = input.phone?.trim() || undefined;
    organization.inquiryContactName = input.inquiryContactName?.trim() || undefined;
    organization.inquiryWhatsApp = input.inquiryWhatsApp?.trim() || undefined;
    organization.instagramUrl = input.instagramUrl || undefined;
    organization.tiktokUrl = input.tiktokUrl || undefined;
    organization.facebookUrl = input.facebookUrl || undefined;
    organization.youtubeUrl = input.youtubeUrl || undefined;
    organization.timezone = input.timezone;
    organization.cancellationNoticeHours = input.cancellationNoticeHours;
    await organization.save();
    resetPublicSocialLinksCache();

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
          instagramUrl: organization.instagramUrl ?? "",
          tiktokUrl: organization.tiktokUrl ?? "",
          facebookUrl: organization.facebookUrl ?? "",
          youtubeUrl: organization.youtubeUrl ?? "",
          timezone: organization.timezone ?? "America/Argentina/Buenos_Aires",
          cancellationNoticeHours: organization.cancellationNoticeHours
        }
      }
    });

    response.json({ organization });
  } catch (error) {
    next(error);
  }
});
