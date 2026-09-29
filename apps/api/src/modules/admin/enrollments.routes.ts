import { Router } from "express";
import { z } from "zod";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { objectIdSchema } from "./admin.schemas";

const createEnrollmentSchema = z.object({
  classId: objectIdSchema,
  studentId: objectIdSchema
});

export const adminEnrollmentsRouter = Router();

adminEnrollmentsRouter.get("/", async (request, response, next) => {
  try {
    const classId = objectIdSchema.parse(request.query.classId);
    const organizationId = request.auth!.organizationId;

    const danceClass = await DanceClassModel.findOne({
      _id: classId,
      organizationId
    });

    if (!danceClass) {
      response.status(404).json({ error: "CLASS_NOT_FOUND" });
      return;
    }

    const items = await EnrollmentModel.find({
      organizationId,
      classId,
      status: "ACTIVE"
    })
      .populate("studentId", "firstName lastName email phone isActive")
      .sort({ enrolledAt: 1 });

    response.json({
      items,
      capacity: danceClass.capacity,
      occupied: items.length,
      available: Math.max(0, danceClass.capacity - items.length)
    });
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.post("/", async (request, response, next) => {
  try {
    const input = createEnrollmentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const [danceClass, student] = await Promise.all([
      DanceClassModel.findOne({ _id: input.classId, organizationId, status: "ACTIVE" }),
      StudentModel.findOne({ _id: input.studentId, organizationId, isActive: true })
    ]);

    if (!danceClass) {
      response.status(404).json({ error: "CLASS_NOT_FOUND" });
      return;
    }

    if (!student) {
      response.status(404).json({ error: "STUDENT_NOT_FOUND" });
      return;
    }

    if (student.branchId.toString() !== danceClass.branchId.toString()) {
      response.status(422).json({ error: "STUDENT_BRANCH_MISMATCH" });
      return;
    }

    const activeCount = await EnrollmentModel.countDocuments({
      organizationId,
      classId: danceClass._id,
      status: "ACTIVE"
    });

    const existing = await EnrollmentModel.findOne({
      organizationId,
      classId: danceClass._id,
      studentId: student._id
    });

    if (existing?.status === "ACTIVE") {
      response.status(409).json({ error: "STUDENT_ALREADY_ENROLLED" });
      return;
    }

    if (activeCount >= danceClass.capacity) {
      response.status(409).json({ error: "CLASS_CAPACITY_REACHED" });
      return;
    }

    const enrollment = existing
      ? await EnrollmentModel.findByIdAndUpdate(
          existing._id,
          {
            $set: {
              status: "ACTIVE",
              enrolledAt: new Date(),
              endedAt: undefined
            }
          },
          { new: true }
        )
      : await EnrollmentModel.create({
          organizationId,
          branchId: danceClass.branchId,
          classId: danceClass._id,
          studentId: student._id,
          status: "ACTIVE",
          enrolledAt: new Date()
        });

    response.status(201).json(enrollment);
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const enrollment = await EnrollmentModel.findOneAndUpdate(
      { _id: id, organizationId: request.auth!.organizationId, status: "ACTIVE" },
      { $set: { status: "INACTIVE", endedAt: new Date() } },
      { new: true }
    );

    if (!enrollment) {
      response.status(404).json({ error: "ENROLLMENT_NOT_FOUND" });
      return;
    }

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
