import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import {
  confirmProfessorIntroVideoUpload,
  createProfessorIntroVideoUploadSignature,
  deleteProfessorMedia,
  professorAvatarUpload,
  professorVideoUpload,
  uploadProfessorAvatar,
  uploadProfessorIntroVideo
} from "../../services/professor-media";
import { requireAuth, requireRole } from "../../middleware/require-auth";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { BranchModel } from "../core/branch.model";
import { ProfessorModel } from "../professors/professor.model";
import { professorOperationsRouter } from "./professor-operations.routes";
import { loadProfessorContext, ownedClasses } from "./professor-scope";

const updateOwnProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  bio: z.string().trim().max(600).optional().or(z.literal("")),
  instagram: z.string().trim().max(120).optional().or(z.literal(""))
});

const completeProfessorVideoUploadSchema = z.object({
  publicId: z.string().trim().min(1).max(500)
});

export const professorPortalRouter = Router();

professorPortalRouter.use(requireAuth, requireRole("PROFESSOR"));

professorPortalRouter.use(professorOperationsRouter);

professorPortalRouter.get("/profile", async (request, response, next) => {
  try {
    const context = await loadProfessorContext(request);
    const { organizationId, user, professor } = context;
    const classes = await ownedClasses(context, { activeOnly: true });

    const branches = await BranchModel.find({
      organizationId,
      _id: { $in: user.branchIds }
    })
      .select("name address isActive")
      .sort({ name: 1 })
      .lean();

    // Specialties: profile disciplines plus the ones of the classes actually taught.
    const specialties = new Map<string, { id: string; name: string }>();
    for (const item of professor.disciplineIds ?? []) {
      specialties.set(String(item._id), { id: String(item._id), name: item.name });
    }
    for (const danceClass of classes) {
      for (const item of danceClass.disciplineIds ?? []) {
        specialties.set(String(item._id), { id: String(item._id), name: item.name });
      }
    }

    response.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? ""
      },
      professor: {
        id: professor.id,
        displayName: professor.displayName,
        phone: professor.phone ?? user.phone ?? "",
        bio: professor.bio ?? "",
        instagram: professor.instagram ?? "",
        avatarUrl: professor.avatarUrl ?? "",
        introVideoUrl: professor.introVideoUrl ?? "",
        specialties: [...specialties.values()]
      },
      branches: branches.map((item) => ({
        id: String(item._id),
        name: item.name,
        address: item.address ?? "",
        isActive: item.isActive
      }))
    });
  } catch (error) {
    next(error);
  }
});

professorPortalRouter.patch("/profile", async (request, response, next) => {
  try {
    const input = updateOwnProfileSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const userId = request.auth!.userId;

    const [user, professor] = await Promise.all([
      UserModel.findOne({
        _id: userId,
        organizationId,
        role: "PROFESSOR",
        isActive: true
      }),
      ProfessorModel.findOne({
        organizationId,
        userId,
        isActive: true
      })
    ]);

    if (!user || !professor) {
      throw new AppError(
        404,
        "Perfil de profesor no encontrado o inactivo",
        "PROFESSOR_PROFILE_NOT_FOUND"
      );
    }

    const before = {
      displayName: professor.displayName,
      phone: professor.phone ?? "",
      bio: professor.bio ?? "",
      instagram: professor.instagram ?? ""
    };

    if (input.displayName !== undefined) professor.displayName = input.displayName;
    if (input.phone !== undefined) {
      const phone = input.phone.trim() || undefined;
      professor.phone = phone;
      user.phone = phone;
    }
    if (input.bio !== undefined) professor.bio = input.bio.trim() || undefined;
    if (input.instagram !== undefined) professor.instagram = input.instagram.trim() || undefined;

    await Promise.all([professor.save(), user.save()]);

    await AuditLogModel.create({
      organizationId,
      actorUserId: user._id,
      action: "PROFESSOR_SELF_PROFILE_UPDATED",
      entityType: "Professor",
      entityId: professor._id,
      metadata: {
        before,
        after: {
          displayName: professor.displayName,
          phone: professor.phone ?? "",
          bio: professor.bio ?? "",
          instagram: professor.instagram ?? ""
        }
      }
    });

    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

professorPortalRouter.post(
  "/profile/avatar",
  professorAvatarUpload.single("file"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        throw new AppError(422, "Seleccioná una imagen", "PROFESSOR_AVATAR_REQUIRED");
      }

      const organizationId = request.auth!.organizationId;
      const professor = await ProfessorModel.findOne({
        organizationId,
        userId: request.auth!.userId,
        isActive: true
      });

      if (!professor) {
        throw new AppError(404, "Perfil de profesor no encontrado", "PROFESSOR_PROFILE_NOT_FOUND");
      }

      const result = await uploadProfessorAvatar(
        request.file.buffer,
        organizationId,
        professor.id
      );

      professor.avatarUrl = result.secure_url;
      await professor.save();

      await AuditLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        action: "PROFESSOR_SELF_AVATAR_UPDATED",
        entityType: "Professor",
        entityId: professor._id
      });

      response.json({ avatarUrl: professor.avatarUrl });
    } catch (error) {
      next(error);
    }
  }
);

professorPortalRouter.delete("/profile/avatar", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const professor = await ProfessorModel.findOne({
      organizationId,
      userId: request.auth!.userId,
      isActive: true
    });

    if (!professor) {
      throw new AppError(404, "Perfil de profesor no encontrado", "PROFESSOR_PROFILE_NOT_FOUND");
    }

    await deleteProfessorMedia(organizationId, professor.id, "avatar").catch(() => undefined);
    professor.avatarUrl = undefined;
    await professor.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_SELF_AVATAR_REMOVED",
      entityType: "Professor",
      entityId: professor._id
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

professorPortalRouter.post(
  "/profile/intro-video/signature",
  async (request, response, next) => {
    try {
      const organizationId = request.auth!.organizationId;
      const professor = await ProfessorModel.findOne({
        organizationId,
        userId: request.auth!.userId,
        isActive: true
      });

      if (!professor) {
        throw new AppError(404, "Perfil de profesor no encontrado", "PROFESSOR_PROFILE_NOT_FOUND");
      }

      response.json(createProfessorIntroVideoUploadSignature(organizationId, professor.id));
    } catch (error) {
      next(error);
    }
  }
);

professorPortalRouter.post(
  "/profile/intro-video/complete",
  async (request, response, next) => {
    try {
      const input = completeProfessorVideoUploadSchema.parse(request.body);
      const organizationId = request.auth!.organizationId;
      const professor = await ProfessorModel.findOne({
        organizationId,
        userId: request.auth!.userId,
        isActive: true
      });

      if (!professor) {
        throw new AppError(404, "Perfil de profesor no encontrado", "PROFESSOR_PROFILE_NOT_FOUND");
      }

      professor.introVideoUrl = await confirmProfessorIntroVideoUpload(
        organizationId,
        professor.id,
        input.publicId
      );
      await professor.save();

      await AuditLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        action: "PROFESSOR_SELF_INTRO_VIDEO_UPDATED",
        entityType: "Professor",
        entityId: professor._id
      });

      response.json({ introVideoUrl: professor.introVideoUrl });
    } catch (error) {
      next(error);
    }
  }
);

professorPortalRouter.post(
  "/profile/intro-video",
  professorVideoUpload.single("file"),
  async (request, response, next) => {
    try {
      if (!request.file) {
        throw new AppError(422, "Seleccioná un video", "PROFESSOR_VIDEO_REQUIRED");
      }

      const organizationId = request.auth!.organizationId;
      const professor = await ProfessorModel.findOne({
        organizationId,
        userId: request.auth!.userId,
        isActive: true
      });

      if (!professor) {
        throw new AppError(404, "Perfil de profesor no encontrado", "PROFESSOR_PROFILE_NOT_FOUND");
      }

      const result = await uploadProfessorIntroVideo(
        request.file.buffer,
        organizationId,
        professor.id
      );

      professor.introVideoUrl = result.secure_url;
      await professor.save();

      await AuditLogModel.create({
        organizationId,
        actorUserId: request.auth!.userId,
        action: "PROFESSOR_SELF_INTRO_VIDEO_UPDATED",
        entityType: "Professor",
        entityId: professor._id
      });

      response.json({ introVideoUrl: professor.introVideoUrl });
    } catch (error) {
      next(error);
    }
  }
);

professorPortalRouter.delete("/profile/intro-video", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const professor = await ProfessorModel.findOne({
      organizationId,
      userId: request.auth!.userId,
      isActive: true
    });

    if (!professor) {
      throw new AppError(404, "Perfil de profesor no encontrado", "PROFESSOR_PROFILE_NOT_FOUND");
    }

    await deleteProfessorMedia(organizationId, professor.id, "intro-video").catch(() => undefined);
    professor.introVideoUrl = undefined;
    await professor.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_SELF_INTRO_VIDEO_REMOVED",
      entityType: "Professor",
      entityId: professor._id
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
