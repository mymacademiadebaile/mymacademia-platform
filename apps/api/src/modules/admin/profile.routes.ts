import bcrypt from "bcryptjs";
import { Router } from "express";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import {
  changeAdminPasswordSchema,
  updateAdminProfileSchema
} from "./profile.schemas";

export const adminProfileRouter = Router();

adminProfileRouter.get("/", async (request, response, next) => {
  try {
    const organizationId = request.auth!.organizationId;

    const user = await UserModel.findOne({
      _id: request.auth!.userId,
      organizationId,
      isActive: true
    }).select("email firstName lastName phone role branchIds");

    if (!user) {
      throw new AppError(404, "Usuario administrador no encontrado", "USER_NOT_FOUND");
    }

    const [organization, branches] = await Promise.all([
      OrganizationModel.findById(organizationId).select("name email phone timezone isActive"),
      BranchModel.find({
        organizationId,
        _id: { $in: user.branchIds }
      }).select("name address isActive").sort({ name: 1 })
    ]);

    response.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? "",
        role: user.role,
        branchIds: user.branchIds.map((id) => id.toString())
      },
      organization,
      branches
    });
  } catch (error) {
    next(error);
  }
});

adminProfileRouter.patch("/", async (request, response, next) => {
  try {
    const input = updateAdminProfileSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const user = await UserModel.findOne({
      _id: request.auth!.userId,
      organizationId,
      isActive: true
    });

    if (!user) {
      throw new AppError(404, "Usuario administrador no encontrado", "USER_NOT_FOUND");
    }

    if (input.email !== user.email) {
      const duplicate = await UserModel.exists({
        organizationId,
        email: input.email,
        _id: { $ne: user._id }
      });

      if (duplicate) {
        throw new AppError(
          409,
          "Ya existe un usuario con ese email",
          "EMAIL_ALREADY_EXISTS"
        );
      }
    }

    const before = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? ""
    };

    user.firstName = input.firstName;
    user.lastName = input.lastName;
    user.email = input.email;
    user.phone = input.phone?.trim() || undefined;
    await user.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: user._id,
      action: "ADMIN_PROFILE_UPDATED",
      entityType: "User",
      entityId: user._id,
      metadata: {
        before,
        after: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone ?? ""
        }
      }
    });

    response.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? "",
        role: user.role,
        branchIds: user.branchIds.map((id) => id.toString())
      }
    });
  } catch (error) {
    next(error);
  }
});

adminProfileRouter.post("/password", async (request, response, next) => {
  try {
    const input = changeAdminPasswordSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const user = await UserModel.findOne({
      _id: request.auth!.userId,
      organizationId,
      isActive: true
    }).select("+passwordHash");

    if (!user) {
      throw new AppError(404, "Usuario administrador no encontrado", "USER_NOT_FOUND");
    }

    const currentMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);

    if (!currentMatches) {
      throw new AppError(
        422,
        "La contraseña actual no es correcta",
        "CURRENT_PASSWORD_INVALID"
      );
    }

    const samePassword = await bcrypt.compare(input.newPassword, user.passwordHash);

    if (samePassword) {
      throw new AppError(
        422,
        "La nueva contraseña debe ser diferente a la actual",
        "PASSWORD_MUST_CHANGE"
      );
    }

    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    await user.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: user._id,
      action: "ADMIN_PASSWORD_CHANGED",
      entityType: "User",
      entityId: user._id
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
