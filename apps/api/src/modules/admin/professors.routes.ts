import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserModel } from "../auth/user.model";
import { ProfessorModel } from "../professors/professor.model";
import { objectIdSchema } from "./admin.schemas";

const createProfessorSchema = z.object({
  branchIds: z.array(objectIdSchema).default([]),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(600).optional(),
  instagram: z.string().trim().max(120).optional()
});

const updateProfessorSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(600).optional(),
  instagram: z.string().trim().max(120).optional(),
  avatarUrl: z.string().url().optional(),
  isActive: z.boolean().optional()
});

export const adminProfessorsRouter = Router();

adminProfessorsRouter.get("/", async (request, response, next) => {
  try {
    const items = await ProfessorModel.find({
      organizationId: request.auth!.organizationId
    })
      .populate("userId", "firstName lastName email branchIds role isActive")
      .sort({ displayName: 1 });

    response.json(items);
  } catch (error) {
    next(error);
  }
});

adminProfessorsRouter.post("/", async (request, response, next) => {
  let userId: string | undefined;

  try {
    const input = createProfessorSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const existing = await UserModel.exists({
      organizationId,
      email: input.email.toLowerCase()
    });

    if (existing) {
      response.status(409).json({ error: "EMAIL_ALREADY_EXISTS" });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await UserModel.create({
      organizationId,
      branchIds: input.branchIds,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: "PROFESSOR",
      isActive: true
    });
    userId = user.id;

    const professor = await ProfessorModel.create({
      organizationId,
      userId: user._id,
      displayName: input.displayName,
      phone: input.phone,
      bio: input.bio,
      instagram: input.instagram,
      isActive: true
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
    const professor = await ProfessorModel.findOneAndUpdate(
      { _id: id, organizationId: request.auth!.organizationId },
      { $set: input },
      { new: true }
    );

    if (!professor) {
      response.status(404).json({ error: "PROFESSOR_NOT_FOUND" });
      return;
    }

    response.json(professor);
  } catch (error) {
    next(error);
  }
});
