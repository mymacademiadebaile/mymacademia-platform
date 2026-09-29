import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";
import {
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
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ProfessorModel } from "../professors/professor.model";
import { StudentModel } from "../students/student.model";

const updateOwnProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  bio: z.string().trim().max(600).optional().or(z.literal("")),
  instagram: z.string().trim().max(120).optional().or(z.literal(""))
});

export const professorPortalRouter = Router();

professorPortalRouter.use(requireAuth, requireRole("PROFESSOR"));

professorPortalRouter.get("/dashboard", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;
    const userId = request.auth!.userId;

    const [user, professor] = await Promise.all([
      UserModel.findOne({
        _id: userId,
        organizationId,
        role: "PROFESSOR",
        isActive: true
      }).select("firstName lastName email phone branchIds"),
      ProfessorModel.findOne({
        organizationId,
        userId,
        isActive: true
      }).populate("disciplineIds", "name type")
    ]);

    if (!user || !professor) {
      throw new AppError(
        404,
        "Perfil de profesor no encontrado o inactivo",
        "PROFESSOR_PROFILE_NOT_FOUND"
      );
    }

    const classes = await DanceClassModel.find({
      organizationId,
      professorIds: professor._id,
      status: "ACTIVE"
    })
      .populate("disciplineIds segmentIds levelIds", "name type")
      .sort({ name: 1 });

    const classIds = classes.map((item) => item._id);

    const [enrollmentCounts, studentIds, branches] = await Promise.all([
      classIds.length
        ? EnrollmentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
            {
              $match: {
                organizationId: new Types.ObjectId(organizationId),
                classId: { $in: classIds },
                status: "ACTIVE"
              }
            },
            { $group: { _id: "$classId", count: { $sum: 1 } } }
          ])
        : Promise.resolve([]),
      classIds.length
        ? EnrollmentModel.distinct("studentId", {
            organizationId,
            classId: { $in: classIds },
            status: "ACTIVE"
          })
        : Promise.resolve([]),
      BranchModel.find({
        organizationId,
        _id: { $in: user.branchIds }
      }).select("name address isActive").sort({ name: 1 })
    ]);

    const students = studentIds.length
      ? await StudentModel.find({
          organizationId,
          _id: { $in: studentIds },
          isActive: true
        })
          .select("firstName lastName email phone branchId")
          .sort({ lastName: 1, firstName: 1 })
      : [];

    const countMap = new Map(
      enrollmentCounts.map((item) => [item._id.toString(), item.count])
    );

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
        bio: professor.bio ?? "",
        instagram: professor.instagram ?? "",
        avatarUrl: professor.avatarUrl ?? "",
        introVideoUrl: professor.introVideoUrl ?? "",
        disciplines: professor.disciplineIds
      },
      branches,
      classes: classes.map((item) => ({
        ...item.toObject(),
        activeEnrollmentCount: countMap.get(item.id) ?? 0
      })),
      students
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
