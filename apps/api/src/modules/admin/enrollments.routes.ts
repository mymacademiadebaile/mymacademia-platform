import { Router } from "express";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { enrollmentActivationUpdate, resolveBillingPreference } from "../enrollments/billing-preference";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { assertScheduleCapacity, scheduleKey } from "../sessions/session-booking-service";
import { objectIdSchema } from "./admin.schemas";
import { z } from "zod";

const billingPreferenceSchema = z.enum(["PER_CLASS", "MONTHLY"]);

const createEnrollmentSchema = z.object({
  classId: objectIdSchema,
  studentId: objectIdSchema,
  billingPreference: billingPreferenceSchema.optional(),
  scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14).optional()
});

const updateBillingPreferenceSchema = z.object({
  billingPreference: billingPreferenceSchema
});
const updateScheduleKeysSchema = z.object({
  scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14)
});

function validateScheduleKeys(danceClass: { schedules: Array<{ day: string; startTime: string; endTime: string }> }, keys: string[]) {
  const available = new Set(danceClass.schedules.map(scheduleKey));
  if (new Set(keys).size !== keys.length || keys.some((key) => !available.has(key))) {
    throw new AppError(422, "Uno o más horarios seleccionados no pertenecen a la clase", "INVALID_SCHEDULE_SELECTION");
  }
}

const moveEnrollmentSchema = z.object({
  targetClassId: objectIdSchema,
  billingPreference: billingPreferenceSchema.optional(),
  scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14).optional()
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

adminEnrollmentsRouter.get("/student/:studentId", async (request, response, next) => {
  try {
    const studentId = objectIdSchema.parse(request.params.studentId);
    const organizationId = request.auth!.organizationId;

    const student = await StudentModel.findOne({
      _id: studentId,
      organizationId,
      isActive: true
    });

    if (!student) {
      throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    }

    const items = await EnrollmentModel.find({
      organizationId,
      studentId,
      status: "ACTIVE"
    })
      .populate("classId", "name branchId billingMode pricePerClass monthlyPrice freeTrialEnabled status schedules")
      .sort({ enrolledAt: -1 });

    response.json({ items });
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

    const existing = await EnrollmentModel.findOne({
        organizationId,
        classId: danceClass._id,
        studentId: student._id
      });

    if (existing?.status === "ACTIVE") {
      throw new AppError(409, "El alumno ya está inscripto", "STUDENT_ALREADY_ENROLLED");
    }

    // Old API consumers that did not select slots preserve the historical all-slots behaviour.
    const scheduleKeys = input.scheduleKeys ?? danceClass.schedules.map(scheduleKey);
    validateScheduleKeys(danceClass, scheduleKeys);
    for (const key of scheduleKeys) {
      const schedule = danceClass.schedules.find((item) => scheduleKey(item) === key)!;
      await assertScheduleCapacity(organizationId, danceClass._id, schedule, danceClass.capacity, existing?._id);
    }

    const billingPreference = resolveBillingPreference(
      danceClass.billingMode,
      input.billingPreference,
      existing?.billingPreference
    );

    const activation = enrollmentActivationUpdate({ branchId: danceClass.branchId, billingPreference });
    const enrollment = existing
      ? await EnrollmentModel.findByIdAndUpdate(
          existing._id,
          { ...activation, $set: { ...activation.$set, scheduleKeys } },
          { new: true }
        )
      : await EnrollmentModel.create({
          organizationId,
          branchId: danceClass.branchId,
          classId: danceClass._id,
          studentId: student._id,
          status: "ACTIVE",
          billingPreference,
          scheduleKeys,
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

adminEnrollmentsRouter.patch("/:id/schedule-keys", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateScheduleKeysSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const enrollment = await EnrollmentModel.findOne({ _id: id, organizationId, status: "ACTIVE" });
    if (!enrollment) throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");

    const danceClass = await DanceClassModel.findOne({ _id: enrollment.classId, organizationId, status: "ACTIVE" });
    if (!danceClass) throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
    validateScheduleKeys(danceClass, input.scheduleKeys);
    for (const key of input.scheduleKeys) {
      const schedule = danceClass.schedules.find((item) => scheduleKey(item) === key)!;
      await assertScheduleCapacity(organizationId, danceClass._id, schedule, danceClass.capacity, enrollment._id);
    }

    const before = enrollment.scheduleKeys ?? [];
    enrollment.scheduleKeys = input.scheduleKeys;
    await enrollment.save();
    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_SCHEDULES_UPDATED",
      entityType: "Enrollment",
      entityId: enrollment._id,
      metadata: { classId: enrollment.classId, studentId: enrollment.studentId, before, after: input.scheduleKeys }
    });
    response.json(enrollment);
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

    const targetExisting = await EnrollmentModel.findOne({
        organizationId,
        classId: targetClass._id,
        studentId: student._id
      });

    if (targetExisting?.status === "ACTIVE") {
      throw new AppError(409, "El alumno ya está en la clase de destino", "STUDENT_ALREADY_ENROLLED");
    }

    const scheduleKeys = input.scheduleKeys ?? targetClass.schedules.map(scheduleKey);
    validateScheduleKeys(targetClass, scheduleKeys);
    for (const key of scheduleKeys) {
      const schedule = targetClass.schedules.find((item) => scheduleKey(item) === key)!;
      await assertScheduleCapacity(organizationId, targetClass._id, schedule, targetClass.capacity, targetExisting?._id);
    }

    const billingPreference = resolveBillingPreference(
      targetClass.billingMode,
      input.billingPreference,
      enrollment.billingPreference ?? targetExisting?.billingPreference
    );

    const sourceClassId = enrollment.classId;
    enrollment.status = "INACTIVE";
    enrollment.endedAt = new Date();
    await enrollment.save();

    const targetEnrollment = targetExisting
      ? await EnrollmentModel.findByIdAndUpdate(
          targetExisting._id,
          {
            ...enrollmentActivationUpdate({ branchId: targetClass.branchId, billingPreference }),
            $set: {
              ...enrollmentActivationUpdate({ branchId: targetClass.branchId, billingPreference }).$set,
              scheduleKeys
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
          billingPreference,
          scheduleKeys,
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
        targetClassId: targetClass._id,
        billingPreference: billingPreference ?? null
      }
    });

    response.json(targetEnrollment);
  } catch (error) {
    next(error);
  }
});

adminEnrollmentsRouter.patch("/:id/billing-preference", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateBillingPreferenceSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const enrollment = await EnrollmentModel.findOne({
      _id: id,
      organizationId,
      status: "ACTIVE"
    });

    if (!enrollment) {
      throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
    }

    const danceClass = await DanceClassModel.findOne({
      _id: enrollment.classId,
      organizationId,
      status: "ACTIVE"
    });

    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
    }

    const billingPreference = resolveBillingPreference(danceClass.billingMode, input.billingPreference);
    enrollment.billingPreference = billingPreference;
    await enrollment.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "ENROLLMENT_BILLING_UPDATED",
      entityType: "Enrollment",
      entityId: enrollment._id,
      metadata: {
        classId: enrollment.classId,
        studentId: enrollment.studentId,
        billingPreference
      }
    });

    response.json(enrollment);
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
