import { Router } from "express";
import { z } from "zod";
import { StudentModel } from "../students/student.model";
import { objectIdSchema, pageQuerySchema } from "./admin.schemas";

const studentSchema = z.object({
  branchId: objectIdSchema,
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  birthDate: z.coerce.date().optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional()
});

const updateStudentSchema = studentSchema.partial().extend({
  isActive: z.boolean().optional()
});

export const adminStudentsRouter = Router();

adminStudentsRouter.get("/", async (request, response, next) => {
  try {
    const query = pageQuerySchema.parse(request.query);
    const filter: Record<string, unknown> = {
      organizationId: request.auth!.organizationId
    };

    if (query.q) {
      filter.$or = [
        { firstName: { $regex: query.q, $options: "i" } },
        { lastName: { $regex: query.q, $options: "i" } },
        { email: { $regex: query.q, $options: "i" } },
        { phone: { $regex: query.q, $options: "i" } }
      ];
    }

    const [items, total] = await Promise.all([
      StudentModel.find(filter)
        .sort({ lastName: 1, firstName: 1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      StudentModel.countDocuments(filter)
    ]);

    response.json({ items, total, page: query.page, limit: query.limit });
  } catch (error) {
    next(error);
  }
});

adminStudentsRouter.post("/", async (request, response, next) => {
  try {
    const input = studentSchema.parse(request.body);
    const student = await StudentModel.create({
      organizationId: request.auth!.organizationId,
      ...input,
      email: input.email || undefined,
      isActive: true
    });

    response.status(201).json(student);
  } catch (error) {
    next(error);
  }
});

adminStudentsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateStudentSchema.parse(request.body);
    const student = await StudentModel.findOneAndUpdate(
      { _id: id, organizationId: request.auth!.organizationId },
      { $set: input },
      { new: true }
    );

    if (!student) {
      response.status(404).json({ error: "STUDENT_NOT_FOUND" });
      return;
    }

    response.json(student);
  } catch (error) {
    next(error);
  }
});
