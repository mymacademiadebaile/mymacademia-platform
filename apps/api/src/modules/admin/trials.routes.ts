import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { enrollmentActivationUpdate, resolveBillingPreference } from "../enrollments/billing-preference";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { TRIAL_STATUSES, TrialBookingModel } from "../trials/trial-booking.model";
import { objectIdSchema } from "./admin.schemas";

const createTrialSchema = z.object({
  classId: objectIdSchema,
  studentId: objectIdSchema,
  scheduledFor: z.coerce.date(),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});

const updateTrialSchema = z.object({
  status: z.enum(TRIAL_STATUSES).refine(
    (value) => value === "COMPLETED" || value === "CANCELLED",
    "Sólo se puede completar o cancelar desde este endpoint"
  )
});

const convertTrialSchema = z.object({
  billingPreference: z.enum(["PER_CLASS", "MONTHLY"]).optional()
});

export const adminTrialsRouter = Router();

adminTrialsRouter.get("/", async (request, response, next) => {
  try {
    const classId = objectIdSchema.parse(request.query.classId);
    const organizationId = request.auth!.organizationId;

    const items = await TrialBookingModel.find({
      organizationId,
      classId
    })
      .populate("studentId", "firstName lastName email phone branchId isActive")
      .sort({ scheduledFor: 1, createdAt: 1 });

    response.json({ items });
  } catch (error) {
    next(error);
  }
});

adminTrialsRouter.post("/", async (request, response, next) => {
  try {
    const input = createTrialSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const [danceClass, student] = await Promise.all([
      DanceClassModel.findOne({
        _id: input.classId,
        organizationId,
        status: "ACTIVE"
      }),
      StudentModel.findOne({
        _id: input.studentId,
        organizationId,
        isActive: true
      })
    ]);

    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
    }
    if (!danceClass.freeTrialEnabled) {
      throw new AppError(422, "Esta clase no admite prueba gratuita", "FREE_TRIAL_NOT_ENABLED");
    }
    if (!student) {
      throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");
    }
    if (!danceClass.branchId.equals(student.branchId)) {
      throw new AppError(422, "El alumno y la clase deben pertenecer a la misma sede", "STUDENT_BRANCH_MISMATCH");
    }

    const [activeEnrollment, duplicateTrial] = await Promise.all([
      EnrollmentModel.exists({
        organizationId,
        classId: danceClass._id,
        studentId: student._id,
        status: "ACTIVE"
      }),
      TrialBookingModel.exists({
        organizationId,
        classId: danceClass._id,
        studentId: student._id,
        status: "SCHEDULED"
      })
    ]);

    if (activeEnrollment) {
      throw new AppError(409, "El alumno ya está inscripto en esta clase", "STUDENT_ALREADY_ENROLLED");
    }
    if (duplicateTrial) {
      throw new AppError(409, "El alumno ya tiene una prueba agendada para esta clase", "TRIAL_ALREADY_SCHEDULED");
    }

    const trial = await TrialBookingModel.create({
      organizationId,
      branchId: danceClass.branchId,
      classId: danceClass._id,
      studentId: student._id,
      scheduledFor: input.scheduledFor,
      status: "SCHEDULED",
      notes: input.notes?.trim() || undefined
    });

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "TRIAL_BOOKED",
      entityType: "TrialBooking",
      entityId: trial._id,
      metadata: {
        classId: danceClass._id,
        studentId: student._id,
        scheduledFor: trial.scheduledFor
      }
    });

    response.status(201).json(trial);
  } catch (error) {
    next(error);
  }
});

adminTrialsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateTrialSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const trial = await TrialBookingModel.findOne({
      _id: id,
      organizationId
    });

    if (!trial) {
      throw new AppError(404, "Prueba no encontrada", "TRIAL_NOT_FOUND");
    }
    if (trial.status === "CONVERTED") {
      throw new AppError(409, "La prueba ya fue convertida en inscripción", "TRIAL_ALREADY_CONVERTED");
    }

    trial.status = input.status;
    await trial.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: input.status === "COMPLETED" ? "TRIAL_COMPLETED" : "TRIAL_CANCELLED",
      entityType: "TrialBooking",
      entityId: trial._id
    });

    response.json(trial);
  } catch (error) {
    next(error);
  }
});

adminTrialsRouter.post("/:id/convert", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = convertTrialSchema.parse(request.body ?? {});
    const organizationId = request.auth!.organizationId;

    const trial = await TrialBookingModel.findOne({
      _id: id,
      organizationId,
      status: { $in: ["SCHEDULED", "COMPLETED"] }
    });

    if (!trial) {
      throw new AppError(404, "Prueba disponible para convertir no encontrada", "TRIAL_NOT_CONVERTIBLE");
    }

    const [danceClass, student, existing, occupied] = await Promise.all([
      DanceClassModel.findOne({
        _id: trial.classId,
        organizationId,
        status: "ACTIVE"
      }),
      StudentModel.findOne({
        _id: trial.studentId,
        organizationId,
        isActive: true
      }),
      EnrollmentModel.findOne({
        organizationId,
        classId: trial.classId,
        studentId: trial.studentId
      }),
      EnrollmentModel.countDocuments({
        organizationId,
        classId: trial.classId,
        status: "ACTIVE"
      })
    ]);

    if (!danceClass || !student) {
      throw new AppError(404, "Alumno o clase ya no están disponibles", "TRIAL_TARGET_NOT_AVAILABLE");
    }
    if (existing?.status === "ACTIVE") {
      trial.status = "CONVERTED";
      trial.convertedEnrollmentId = existing._id;
      await trial.save();
      response.json({ trial, enrollment: existing });
      return;
    }
    if (occupied >= danceClass.capacity) {
      throw new AppError(409, "La clase no tiene cupos disponibles", "CLASS_CAPACITY_REACHED");
    }

    const billingPreference = resolveBillingPreference(
      danceClass.billingMode,
      input.billingPreference,
      existing?.billingPreference
    );

    const enrollment = existing
      ? await EnrollmentModel.findByIdAndUpdate(
          existing._id,
          enrollmentActivationUpdate({ branchId: danceClass.branchId, billingPreference }),
          { new: true }
        )
      : await EnrollmentModel.create({
          organizationId,
          branchId: danceClass.branchId,
          classId: danceClass._id,
          studentId: student._id,
          status: "ACTIVE",
          billingPreference,
          enrolledAt: new Date()
        });

    trial.status = "CONVERTED";
    trial.convertedEnrollmentId = enrollment!._id;
    await trial.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "TRIAL_CONVERTED_TO_ENROLLMENT",
      entityType: "TrialBooking",
      entityId: trial._id,
      metadata: {
        enrollmentId: enrollment!._id,
        classId: danceClass._id,
        studentId: student._id,
        billingPreference: billingPreference ?? null
      }
    });

    response.json({ trial, enrollment });
  } catch (error) {
    next(error);
  }
});
