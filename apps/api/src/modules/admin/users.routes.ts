import bcrypt from "bcryptjs";
import { containsText } from "../../common/regex";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { PasswordResetTokenModel } from "../auth/password-reset-token.model";
import { UserModel } from "../auth/user.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { ProfessorModel } from "../professors/professor.model";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";

const manageableRoles = z.enum(["ADMIN", "PROFESSOR"]);
const passwordSchema = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres")
  .max(128)
  .regex(/[A-Za-z]/, "La contraseña debe incluir una letra")
  .regex(/[0-9]/, "La contraseña debe incluir un número");

const createUserSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: passwordSchema,
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  role: manageableRoles,
  branchIds: z.array(objectIdSchema).min(1, "Seleccioná al menos una sede")
});

const updateUserSchema = z.object({
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  password: passwordSchema.optional(),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  branchIds: z.array(objectIdSchema).min(1, "Seleccioná al menos una sede").optional(),
  isActive: z.boolean().optional()
});

const listQuerySchema = pageQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(120).optional(),
  role: manageableRoles.optional(),
  isActive: z.enum(["true", "false"]).optional()
});

async function validateBranches(organizationId: string, branchIds: string[]) {
  const count = await BranchModel.countDocuments({
    organizationId,
    _id: { $in: branchIds },
    isActive: true
  });

  if (count !== branchIds.length) {
    throw new AppError(422, "Una o más sedes no son válidas", "INVALID_BRANCHES");
  }
}

function userResponse(user: {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: "ADMIN" | "PROFESSOR" | "SUPER_ADMIN";
  isActive: boolean;
  branchIds: Types.ObjectId[];
  createdAt?: Date;
}) {
  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? "",
    role: user.role,
    isActive: user.isActive,
    branchIds: user.branchIds.map((value) => value.toString()),
    createdAt: user.createdAt
  };
}

export const adminUsersRouter = Router();

adminUsersRouter.get("/", async (request, response, next) => {
  try {
    const query = listQuerySchema.parse(request.query);
    const filter: Record<string, unknown> = {
      organizationId: request.auth!.organizationId,
      role: { $in: ["ADMIN", "PROFESSOR"] }
    };

    if (query.role) filter.role = query.role;
    if (query.isActive) filter.isActive = query.isActive === "true";
    if (query.q) {
      filter.$or = [
        { firstName: containsText(query.q) },
        { lastName: containsText(query.q) },
        { email: containsText(query.q) }
      ];
    }

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .select("firstName lastName email phone role isActive branchIds createdAt")
        .sort({ role: 1, lastName: 1, firstName: 1, _id: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      UserModel.countDocuments(filter)
    ]);

    response.json({
      items: users.map(userResponse),
      total,
      page: query.page,
      limit: query.limit
    });
  } catch (error) {
    next(error);
  }
});

adminUsersRouter.post("/", async (request, response, next) => {
  try {
    const input = createUserSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    await validateBranches(organizationId, input.branchIds);

    const existing = await UserModel.exists({ organizationId, email: input.email });
    if (existing) {
      throw new AppError(409, "Ya existe un usuario con ese email", "EMAIL_ALREADY_EXISTS");
    }

    const user = await UserModel.create({
      organizationId,
      branchIds: input.branchIds.map((id) => new Types.ObjectId(id)),
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone?.trim() || undefined,
      role: input.role,
      isActive: true
    });

    if (input.role === "PROFESSOR") {
      await ProfessorModel.create({
        organizationId,
        userId: user._id,
        disciplineIds: [],
        displayName: `${user.firstName} ${user.lastName}`,
        phone: user.phone,
        isActive: true
      });
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user._id,
      metadata: { email: user.email, role: user.role, branchIds: input.branchIds }
    });

    response.status(201).json(userResponse(user));
  } catch (error) {
    next(error);
  }
});

adminUsersRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateUserSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const user = await UserModel.findOne({
      _id: id,
      organizationId,
      role: { $in: ["ADMIN", "PROFESSOR"] }
    }).select("+passwordHash");

    if (!user) throw new AppError(404, "Usuario no encontrado", "USER_NOT_FOUND");
    if (user.id === request.auth!.userId && input.isActive === false) {
      throw new AppError(422, "No podés desactivar tu propio acceso", "CANNOT_DEACTIVATE_SELF");
    }
    if (input.branchIds) await validateBranches(organizationId, input.branchIds);

    if (input.email && input.email !== user.email) {
      const duplicate = await UserModel.exists({
        organizationId,
        email: input.email,
        _id: { $ne: user._id }
      });
      if (duplicate) throw new AppError(409, "Ya existe un usuario con ese email", "EMAIL_ALREADY_EXISTS");
    }

    const before = userResponse(user);
    if (input.firstName !== undefined) user.firstName = input.firstName;
    if (input.lastName !== undefined) user.lastName = input.lastName;
    if (input.email !== undefined) user.email = input.email;
    if (input.phone !== undefined) user.phone = input.phone.trim() || undefined;
    if (input.branchIds !== undefined) user.branchIds = input.branchIds.map((id) => new Types.ObjectId(id));
    if (input.isActive !== undefined) user.isActive = input.isActive;
    if (input.password !== undefined) user.passwordHash = await bcrypt.hash(input.password, 12);

    await user.save();

    if (user.role === "PROFESSOR") {
      await ProfessorModel.updateOne(
        { organizationId, userId: user._id },
        {
          $set: {
            displayName: `${user.firstName} ${user.lastName}`,
            phone: user.phone,
            isActive: user.isActive
          }
        }
      );
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: user._id,
      metadata: { before, after: userResponse(user), passwordChanged: input.password !== undefined }
    });

    response.json(userResponse(user));
  } catch (error) {
    next(error);
  }
});

adminUsersRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;
    const user = await UserModel.findOne({
      _id: id,
      organizationId,
      role: { $in: ["ADMIN", "PROFESSOR"] }
    });

    if (!user) throw new AppError(404, "Usuario no encontrado", "USER_NOT_FOUND");
    if (user.id === request.auth!.userId) {
      throw new AppError(422, "No podés eliminar tu propio acceso", "CANNOT_DELETE_SELF");
    }

    const professor = user.role === "PROFESSOR"
      ? await ProfessorModel.findOne({ organizationId, userId: user._id })
      : null;

    if (professor) {
      const assignedClasses = await DanceClassModel.countDocuments({ organizationId, professorIds: professor._id });
      if (assignedClasses > 0) {
        throw new AppError(
          409,
          `No se puede eliminar el profesor porque está vinculado a ${assignedClasses} clase(s). Inactivalo o reasigná sus clases.`,
          "PROFESSOR_IN_USE"
        );
      }
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "USER_DELETED",
      entityType: "User",
      entityId: user._id,
      metadata: { email: user.email, role: user.role }
    });

    await Promise.all([
      ProfessorModel.deleteOne({ organizationId, userId: user._id }),
      PasswordResetTokenModel.deleteMany({ userId: user._id }),
      UserModel.deleteOne({ _id: user._id, organizationId })
    ]);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
