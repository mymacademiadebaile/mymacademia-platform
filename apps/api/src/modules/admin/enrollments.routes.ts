import { Router } from "express";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { objectIdSchema } from "./admin.schemas";
import { z } from "zod";

const createEnrollmentSchema = z.object({
  classId: objectIdSchema,
  studentId: objectIdSchema
});

const moveEnrollmentSchema = z.object({
  targetClassId: objectIdSchema
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
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    const items = await EnrollmentModel.find({
      organizationId,
      classId,
      status: "ACTIVE"
    })
      .populate("studentId", "firstName lastName email phone isActive branchId")
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
      throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
    }

    if (!student) {
      throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    }

    if (student.branchId.toString() !== danceClass.branchId.toString()) {
      throw new AppError(
        422,
        "El alumno y la clase deben pertenecer a la misma sede",
        "STUDENT_BRANCH_MISMATCH"
      );
    }

    const [activeCount, existing] = await Promise.all([
      EnrollmentModel.countDocuments({
        organizationId,
        classId: danceClass._id,
        status: "ACTIVE"
      }),
      EnrollmentModel.findOne({
        organizationId,
        classId: danceClass._id,
        studentId: student._id
      })
    ]);

    if (existing?.status === "ACTIVE") {
      throw new AppError(409, "El alumno ya está inscripto", "STUDENT_ALREADY_ENROLLED");
    }

    if (activeCount >= danceClass.capacity) {
      throw new AppError(409, "La clase no tiene cupos disponibles", "CLASS_CAPACITY_REACHED");
    }

    const enrollment = existing
      ? await EnrollmentModel.findByIdAndUpdate(
          existing._id,
          {
            $set: {
              branchId: danceClass.branchId,
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

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_CREATED",
      entityType: "Enrollment",
      entityId: enrollment!._id,
      metadata: {
        classId: danceClass._id,
        studentId: student._id
      }
    });

    response.status(201).json(enrollment);
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.post("/:id/move", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = moveEnrollmentSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const enrollment = await EnrollmentModel.findOne({
      _id: id,
      organizationId,
      status: "ACTIVE"
    });

    if (!enrollment) {
      throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    }

    const [student, targetClass] = await Promise.all([
      StudentModel.findOne({
        _id: enrollment.studentId,
        organizationId,
        isActive: true
      }),
      DanceClassModel.findOne({
        _id: input.targetClassId,
        organizationId,
        status: "ACTIVE"
      })
    ]);

    if (!student || !targetClass) {
      throw new AppError(404, "Alumno o clase de destino no disponibles", "MOVE_TARGET_NOT_FOUND");
    }

    if (targetClass._id.equals(enrollment.classId)) {
      throw new AppError(422, "Seleccioná una clase diferente", "SAME_CLASS");
    }

    if (!targetClass.branchId.equals(student.branchId)) {
      throw new AppError(422, "La clase debe pertenecer a la misma sede", "STUDENT_BRANCH_MISMATCH");
    }

    const [occupied, targetExisting] = await Promise.all([
      EnrollmentModel.countDocuments({
        organizationId,
        classId: targetClass._id,
        status: "ACTIVE"
      }),
      EnrollmentModel.findOne({
        organizationId,
        classId: targetClass._id,
        studentId: student._id
      })
    ]);

    if (targetExisting?.status === "ACTIVE") {
      throw new AppError(409, "El alumno ya está en la clase de destino", "STUDENT_ALREADY_ENROLLED");
    }

    if (occupied >= targetClass.capacity) {
      throw new AppError(409, "La clase de destino no tiene cupo", "CLASS_CAPACITY_REACHED");
    }

    const sourceClassId = enrollment.classId;
    enrollment.status = "INACTIVE";
    enrollment.endedAt = new Date();
    await enrollment.save();

    const targetEnrollment = targetExisting
      ? await EnrollmentModel.findByIdAndUpdate(
          targetExisting._id,
          {
            $set: {
              branchId: targetClass.branchId,
              status: "ACTIVE",
              enrolledAt: new Date(),
              endedAt: undefined
            }
          },
          { new: true }
        )
      : await EnrollmentModel.create({
          organizationId,
          branchId: targetClass.branchId,
          classId: targetClass._id,
          studentId: student._id,
          status: "ACTIVE",
          enrolledAt: new Date()
        });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_MOVED",
      entityType: "Enrollment",
      entityId: targetEnrollment!._id,
      metadata: {
        studentId: student._id,
        sourceClassId,
        targetClassId: targetClass._id
      }
    });

    response.json(targetEnrollment);
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const enrollment = await EnrollmentModel.findOneAndUpdate(
      { _id: id, organizationId, status: "ACTIVE" },
      { $set: { status: "INACTIVE", endedAt: new Date() } },
      { new: true }
    );

    if (!enrollment) {
      throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_ENDED",
      entityType: "Enrollment",
      entityId: enrollment._id,
      metadata: {
        classId: enrollment.classId,
        studentId: enrollment.studentId
      }
    });

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
