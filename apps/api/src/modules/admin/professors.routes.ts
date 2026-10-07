import bcrypt from "bcryptjs";
import { containsText } from "../../common/regex";
import { Router } from "express";
import { Types } from "mongoose";
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
import { AuditLogModel } from "../audit/audit-log.model";
import { PasswordResetTokenModel } from "../auth/password-reset-token.model";
import { UserModel } from "../auth/user.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ProfessorModel } from "../professors/professor.model";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";
import { uniqueSlug } from "../../common/slug";
import { professorPublishIssues } from "../public/publish-rules";

const cleanOptionalString = z.string().trim().max(2000).optional().or(z.literal(""));
const cleanShortString = z.string().trim().max(160).optional().or(z.literal(""));

const createProfessorSchema = z.object({
  branchIds: z.array(objectIdSchema).min(1),
  disciplineIds: z.array(objectIdSchema).default([]),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  bioShort: cleanShortString,
  bio: cleanOptionalString,
  instagram: z.string().trim().max(120).optional().or(z.literal(""))
});

const updateProfessorSchema = z.object({
  branchIds: z.array(objectIdSchema).min(1).optional(),
  disciplineIds: z.array(objectIdSchema).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().min(2).max(80).optional(),
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  bioShort: cleanShortString,
  bio: cleanOptionalString,
  instagram: z.string().trim().max(120).optional().or(z.literal("")),
  publishOnWeb: z.boolean().optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
  introVideoUrl: z.string().url().optional().or(z.literal("")),
  isActive: z.boolean().optional()
});

const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .max(128)
    .regex(/[A-Za-z]/, "La contraseña debe incluir una letra")
    .regex(/[0-9]/, "La contraseña debe incluir un número")
});

const listQuerySchema = pageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(120).optional(),
  branchId: objectIdSchema.optional(),
  disciplineId: objectIdSchema.optional(),
  isActive: z.enum(["true", "false"]).optional()
});

const completeProfessorVideoUploadSchema = z.object({
  publicId: z.string().trim().min(1).max(500)
});

async function validateRelations(
  organizationId: string,
  branchIds: string[],
  disciplineIds: string[]
) {
  const [branchCount, disciplineCount] = await Promise.all([
    BranchModel.countDocuments({
      _id: { $in: branchIds },
      organizationId,
      isActive: true
    }),
    disciplineIds.length
      ? CatalogItemModel.countDocuments({
          _id: { $in: disciplineIds },
          organizationId,
          type: "DISCIPLINE",
          isActive: true
        })
      : Promise.resolve(0)
  ]);

  if (branchCount !== branchIds.length) {
    throw new AppError(422, "Una o más sedes no son válidas", "INVALID_BRANCHES");
  }

  if (disciplineCount !== disciplineIds.length) {
    throw new AppError(422, "Una o más disciplinas no son válidas", "INVALID_DISCIPLINES");
  }
}

export const adminProfessorsRouter = Router();

adminProfessorsRouter.get("/", async (request, response, next) => {
  try {
    const query = listQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const filter: Record<string, unknown> = { organizationId };

    if (query.isActive) {
      filter.isActive = query.isActive === "true";
    }

    if (query.disciplineId) {
      filter.disciplineIds = query.disciplineId;
    }

    if (query.branchId) {
      const branchUserIds = await UserModel.find({
        organizationId,
        role: "PROFESSOR",
        branchIds: query.branchId
      }).distinct("_id");
      filter.userId = { $in: branchUserIds };
    }

    if (query.q) {
      const userFilter: Record<string, unknown> = {
        organizationId,
        role: "PROFESSOR",
        $or: [
          { firstName: containsText(query.q) },
          { lastName: containsText(query.q) },
          { email: containsText(query.q) }
        ]
      };

      if (query.branchId) userFilter.branchIds = query.branchId;

      const matchingUserIds = await UserModel.find(userFilter).distinct("_id");
      const displayNameMatch = { displayName: containsText(query.q) };
      filter.$or = matchingUserIds.length
        ? [{ userId: { $in: matchingUserIds } }, displayNameMatch]
        : [displayNameMatch];
    }

    const [items, total] = await Promise.all([
      ProfessorModel.find(filter)
        .populate("userId", "firstName lastName email phone branchIds role isActive")
        .populate("disciplineIds", "name type isActive sortOrder")
        .sort({ displayName: 1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      ProfessorModel.countDocuments(filter)
    ]);

    response.json({ items, total, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

adminProfessorsRouter.get("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const professor = await ProfessorModel.findOne({
      _id: id,
      organizationId
    })
      .populate("userId", "firstName lastName email phone branchIds role isActive")
      .populate("disciplineIds", "name type isActive sortOrder");

    if (!professor) {
      throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
    }

    const user = professor.userId as unknown as {
      branchIds: Types.ObjectId[];
    };

    const [branches, classes] = await Promise.all([
      BranchModel.find({
        organizationId,
        _id: { $in: user.branchIds }
      }).select("name address isActive").sort({ name: 1 }),
      DanceClassModel.find({
        organizationId,
        professorIds: professor._id
      })
        .populate("disciplineIds segmentIds levelIds", "name type")
        .sort({ status: 1, name: 1 })
    ]);

    const classIds = classes.map((danceClass) => danceClass._id);
    const activeStudentIds = classIds.length
      ? await EnrollmentModel.distinct("studentId", {
          organizationId,
          classId: { $in: classIds },
          status: "ACTIVE"
        })
      : [];

    response.json({
      professor,
      branches,
      classes,
      stats: {
        classes: classes.filter((danceClass) => danceClass.status === "ACTIVE").length,
        students: activeStudentIds.length,
        disciplines: professor.disciplineIds.length,
        branches: branches.length
      }
    });
  } catch (error) {
    next(error);
  }
});

adminProfessorsRouter.post("/", async (request, response, next) => {
  let userId: string | undefined;

  try {
    const input = createProfessorSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    await validateRelations(organizationId, input.branchIds, input.disciplineIds);

    const existing = await UserModel.exists({
      organizationId,
      email: input.email
    });

    if (existing) {
      throw new AppError(409, "Ya existe un usuario con ese email", "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await UserModel.create({
      organizationId,
      branchIds: input.branchIds,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone?.trim() || undefined,
      role: "PROFESSOR",
      isActive: true
    });
    userId = user.id;

    const professor = await ProfessorModel.create({
      organizationId,
      userId: user._id,
      disciplineIds: input.disciplineIds,
      displayName: input.displayName,
      phone: input.phone?.trim() || undefined,
      bio: input.bio?.trim() || undefined,
      instagram: input.instagram?.trim() || undefined,
      isActive: true
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_CREATED",
      entityType: "Professor",
      entityId: professor._id,
      metadata: {
        userId: user._id,
        email: user.email,
        branchIds: input.branchIds,
        disciplineIds: input.disciplineIds
      }
    });

    response.status(201).json(professor);
  } catch (error) {
    if (userId) {
      await UserModel.findByIdAndDelete(userId).catch(() => undefined);
    }
    next(error);
  }
});

adminProfessorsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateProfessorSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const professor = await ProfessorModel.findOne({
      _id: id,
      organizationId
    });

    if (!professor) {
      throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
    }

    const user = await UserModel.findOne({
      _id: professor.userId,
      organizationId,
      role: "PROFESSOR"
    });

    if (!user) {
      throw new AppError(404, "Usuario del profesor no encontrado", "PROFESSOR_USER_NOT_FOUND");
    }

    const branchIds = input.branchIds ?? user.branchIds.map((value) => value.toString());
    const disciplineIds = input.disciplineIds ?? professor.disciplineIds.map((value) => value.toString());

    if (input.branchIds || input.disciplineIds) {
      await validateRelations(organizationId, branchIds, disciplineIds);
    }

    if (input.email && input.email !== user.email) {
      const duplicate = await UserModel.exists({
        organizationId,
        email: input.email,
        _id: { $ne: user._id }
      });

      if (duplicate) {
        throw new AppError(409, "Ya existe un usuario con ese email", "EMAIL_ALREADY_EXISTS");
      }
    }

    const before = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      branchIds: user.branchIds.map((value) => value.toString()),
      displayName: professor.displayName,
      phone: professor.phone ?? "",
      bioShort: professor.bioShort ?? "",
      bio: professor.bio ?? "",
      instagram: professor.instagram ?? "",
      avatarUrl: professor.avatarUrl ?? "",
      introVideoUrl: professor.introVideoUrl ?? "",
      disciplineIds: professor.disciplineIds.map((value) => value.toString()),
      publishOnWeb: professor.publishOnWeb ?? false,
      isActive: professor.isActive
    };

    if (input.firstName !== undefined) user.firstName = input.firstName;
    if (input.lastName !== undefined) user.lastName = input.lastName;
    if (input.email !== undefined) user.email = input.email;
    if (input.phone !== undefined) user.phone = input.phone.trim() || undefined;
    if (input.branchIds !== undefined) {
      user.branchIds = input.branchIds.map((value) => new Types.ObjectId(value));
    }
    if (input.isActive !== undefined) user.isActive = input.isActive;

    if (input.displayName !== undefined) professor.displayName = input.displayName;
    if (input.phone !== undefined) professor.phone = input.phone.trim() || undefined;
    if (input.bioShort !== undefined) professor.bioShort = input.bioShort.trim() || undefined;
    if (input.bio !== undefined) professor.bio = input.bio.trim() || undefined;
    if (input.instagram !== undefined) professor.instagram = input.instagram.trim() || undefined;
    if (input.publishOnWeb !== undefined) professor.publishOnWeb = input.publishOnWeb;
    if (input.avatarUrl !== undefined) professor.avatarUrl = input.avatarUrl.trim() || undefined;
    if (input.introVideoUrl !== undefined) professor.introVideoUrl = input.introVideoUrl.trim() || undefined;
    if (input.disciplineIds !== undefined) {
      professor.disciplineIds = input.disciplineIds.map((value) => new Types.ObjectId(value));
    }
    if (input.isActive !== undefined) professor.isActive = input.isActive;

    if (input.publishOnWeb === true) {
      const issues = professorPublishIssues({
        isActive: professor.isActive,
        bioShort: professor.bioShort,
        avatarUrl: professor.avatarUrl
      });

      if (issues.length > 0) {
        throw new AppError(
          422,
          `No se puede publicar en la web: ${issues.join(", ").toLocaleLowerCase("es-AR")}`,
          "PROFESSOR_NOT_PUBLISHABLE"
        );
      }

      if (!professor.slug) {
        professor.slug = await uniqueSlug(professor.displayName, async (candidate) =>
          Boolean(
            await ProfessorModel.exists({
              organizationId,
              slug: candidate,
              _id: { $ne: professor._id }
            })
          )
        );
      }
    }

    await Promise.all([user.save(), professor.save()]);

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_UPDATED",
      entityType: "Professor",
      entityId: professor._id,
      metadata: {
        before,
        after: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          branchIds: user.branchIds.map((value) => value.toString()),
          displayName: professor.displayName,
          phone: professor.phone ?? "",
          bioShort: professor.bioShort ?? "",
          bio: professor.bio ?? "",
          instagram: professor.instagram ?? "",
          avatarUrl: professor.avatarUrl ?? "",
          introVideoUrl: professor.introVideoUrl ?? "",
          disciplineIds: professor.disciplineIds.map((value) => value.toString()),
          publishOnWeb: professor.publishOnWeb ?? false,
          isActive: professor.isActive
        }
      }
    });

    response.json(professor);
  } catch (error) {
    next(error);
  }
});


adminProfessorsRouter.post(
  "/:id/avatar",
  professorAvatarUpload.single("file"),
  async (request, response, next) => {
    try {
      const id = objectIdSchema.parse(request.params.id);
      const organizationId = request.auth!.organizationId;

      if (!request.file) {
        throw new AppError(422, "Seleccioná una imagen", "PROFESSOR_AVATAR_REQUIRED");
      }

      const professor = await ProfessorModel.findOne({ _id: id, organizationId });

      if (!professor) {
        throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
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
        action: "PROFESSOR_AVATAR_UPDATED",
        entityType: "Professor",
        entityId: professor._id
      });

      response.json({ avatarUrl: professor.avatarUrl });
    } catch (error) {
      next(error);
    }
  }
);

adminProfessorsRouter.delete("/:id/avatar", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const professor = await ProfessorModel.findOne({ _id: id, organizationId });

    if (!professor) {
      throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
    }

    await deleteProfessorMedia(organizationId, professor.id, "avatar").catch(() => undefined);
    professor.avatarUrl = undefined;
    await professor.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_AVATAR_REMOVED",
      entityType: "Professor",
      entityId: professor._id
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminProfessorsRouter.post(
  "/:id/intro-video/signature",
  async (request, response, next) => {
    try {
      const id = objectIdSchema.parse(request.params.id);
      const organizationId = request.auth!.organizationId;
      const professor = await ProfessorModel.findOne({ _id: id, organizationId });

      if (!professor) {
        throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
      }

      response.json(createProfessorIntroVideoUploadSignature(organizationId, professor.id));
    } catch (error) {
      next(error);
    }
  }
);

adminProfessorsRouter.post(
  "/:id/intro-video/complete",
  async (request, response, next) => {
    try {
      const id = objectIdSchema.parse(request.params.id);
      const input = completeProfessorVideoUploadSchema.parse(request.body);
      const organizationId = request.auth!.organizationId;
      const professor = await ProfessorModel.findOne({ _id: id, organizationId });

      if (!professor) {
        throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
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
        action: "PROFESSOR_INTRO_VIDEO_UPDATED",
        entityType: "Professor",
        entityId: professor._id
      });

      response.json({ introVideoUrl: professor.introVideoUrl });
    } catch (error) {
      next(error);
    }
  }
);

adminProfessorsRouter.post(
  "/:id/intro-video",
  professorVideoUpload.single("file"),
  async (request, response, next) => {
    try {
      const id = objectIdSchema.parse(request.params.id);
      const organizationId = request.auth!.organizationId;

      if (!request.file) {
        throw new AppError(422, "Seleccioná un video", "PROFESSOR_VIDEO_REQUIRED");
      }

      const professor = await ProfessorModel.findOne({ _id: id, organizationId });

      if (!professor) {
        throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
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
        action: "PROFESSOR_INTRO_VIDEO_UPDATED",
        entityType: "Professor",
        entityId: professor._id
      });

      response.json({ introVideoUrl: professor.introVideoUrl });
    } catch (error) {
      next(error);
    }
  }
);

adminProfessorsRouter.delete("/:id/intro-video", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const professor = await ProfessorModel.findOne({ _id: id, organizationId });

    if (!professor) {
      throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
    }

    await deleteProfessorMedia(organizationId, professor.id, "intro-video").catch(() => undefined);
    professor.introVideoUrl = undefined;
    await professor.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_INTRO_VIDEO_REMOVED",
      entityType: "Professor",
      entityId: professor._id
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminProfessorsRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const professor = await ProfessorModel.findOne({
      _id: id,
      organizationId
    });

    if (!professor) {
      throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
    }

    const assignedClasses = await DanceClassModel.countDocuments({
      organizationId,
      professorIds: professor._id
    });

    if (assignedClasses > 0) {
      throw new AppError(
        409,
        `No se puede eliminar el profesor porque está vinculado a ${assignedClasses} clase(s). Reasigná esas clases o inactivá el profesor.`,
        "PROFESSOR_IN_USE"
      );
    }

    const userId = professor.userId;

    await Promise.all([
      deleteProfessorMedia(organizationId, professor.id, "avatar").catch(() => undefined),
      deleteProfessorMedia(organizationId, professor.id, "intro-video").catch(() => undefined)
    ]);

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_DELETED",
      entityType: "Professor",
      entityId: professor._id,
      metadata: {
        userId,
        displayName: professor.displayName
      }
    });

    await Promise.all([
      ProfessorModel.deleteOne({ _id: professor._id, organizationId }),
      UserModel.deleteOne({ _id: userId, organizationId, role: "PROFESSOR" }),
      PasswordResetTokenModel.deleteMany({ userId })
    ]);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

adminProfessorsRouter.post("/:id/reset-password", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = resetPasswordSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const professor = await ProfessorModel.findOne({
      _id: id,
      organizationId
    });

    if (!professor) {
      throw new AppError(404, "Profesor no encontrado", "PROFESSOR_NOT_FOUND");
    }

    const user = await UserModel.findOne({
      _id: professor.userId,
      organizationId,
      role: "PROFESSOR"
    }).select("+passwordHash");

    if (!user) {
      throw new AppError(404, "Usuario del profesor no encontrado", "PROFESSOR_USER_NOT_FOUND");
    }

    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    await user.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "PROFESSOR_PASSWORD_RESET",
      entityType: "Professor",
      entityId: professor._id,
      metadata: { userId: user._id }
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
