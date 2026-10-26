import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { containsText } from "../../common/regex";
import { withRequiredTransaction } from "../../common/required-transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { ContactModel } from "../contacts/contact.model";
import { resolveContact } from "../contacts/contact-service";
import { convertContact } from "../contacts/conversion-service";
import { OpportunityModel, OPPORTUNITY_STATUSES } from "../contacts/opportunity.model";
import { BranchModel } from "../core/branch.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { StudentModel } from "../students/student.model";
import { TrialBookingModel } from "../trials/trial-booking.model";
import { TrialBenefitModel } from "../trials/trial-benefit.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { calendarDateSchema, objectIdSchema } from "./admin.schemas";
import { dniSchema, optionalDniSchema } from "../../common/dni";
import { assertDniAvailable, dniLockKey } from "../contacts/dni-service";

const fields = z.object({
  branchId: objectIdSchema, firstName: z.string().trim().min(2).max(80), lastName: z.string().trim().min(2).max(80),
  email: z.union([z.email(), z.literal("")]).optional(), phone: z.string().trim().max(40).optional(),
  dni: optionalDniSchema,
  notes: z.string().trim().max(1000).optional(),
  source: z.object({ platform: z.string().trim().min(1).max(80), campaign: z.string().max(160).optional(),
    advertisement: z.string().max(160).optional(), externalId: z.string().max(160).optional() }).optional(),
  preferences: z.object({ emailReminders: z.boolean(), marketing: z.boolean() }).optional()
});
const createSchema = fields.extend({ creationKey: z.string().min(16).max(100) });
export const adminContactsRouter = Router();

adminContactsRouter.post("/:id/convert", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = z.object({ classId: objectIdSchema, billingPreference: z.enum(["MONTHLY", "PER_CLASS"]).optional(),
      seriesIds: z.array(objectIdSchema).min(1).max(14).optional(), scheduleKeys: z.array(z.string().max(64)).min(1).max(14).optional() }).parse(request.body);
    response.json(await convertContact({ organizationId: request.auth!.organizationId, userId: request.auth!.userId }, id, input));
  } catch (error) { next(error); }
});

adminContactsRouter.get("/", async (request, response, next) => {
  try {
    const { q, limit } = z.object({ q: z.string().trim().max(100).default(""), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    const organizationId = request.auth!.organizationId;
    const documentQuery = dniSchema.safeParse(q);
    const filter = { organizationId, ...(q ? { $or: [...["firstName", "lastName", "email", "phone", "dni"].map((field) => ({ [field]: containsText(q) })), ...(documentQuery.success ? [{ dni: documentQuery.data }] : [])] } : {}) };
    // Contactos is the prospect inbox. Academic profiles are managed in Alumnos.
    const studentIds = await StudentModel.distinct("_id", { organizationId });
    const contacts = await ContactModel.find({ ...filter, _id: { $nin: studentIds } })
      .sort({ lastName: 1, firstName: 1, _id: 1 }).limit(limit).lean();
    response.json({ items: contacts });
  } catch (error) { next(error); }
});

adminContactsRouter.post("/", async (request, response, next) => {
  try {
    const input = createSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const email = input.email?.trim().toLowerCase() || undefined;
    const phone = input.phone?.replace(/\D/g, "") || undefined;
    const identityKey = createHash("sha256").update(JSON.stringify([input.firstName.toLocaleLowerCase("es"), input.lastName.toLocaleLowerCase("es"), email, phone])).digest("hex");
    const keys = [`identity:${identityKey}`, `creation:${input.creationKey}`, ...(input.dni ? [dniLockKey(input.dni)] : []),
      ...(email ? [`identity:email:${createHash("sha256").update(email).digest("hex")}`] : [])];
    await ensureLocks(organizationId, keys);
    const contact = await withRequiredTransaction(async (dbSession) => {
      await touchLocks(organizationId, keys, dbSession);
      if (!await BranchModel.exists({ _id: input.branchId, organizationId, isActive: true }).session(dbSession)) throw new AppError(422, "Sede no disponible", "INVALID_BRANCH");
      const retry = await ContactModel.findOne({ organizationId, creationKey: input.creationKey }).session(dbSession);
      if (retry) {
        if (retry.firstName !== input.firstName || retry.lastName !== input.lastName || retry.email !== email || retry.phone !== phone || retry.dni !== input.dni) {
          throw new AppError(409, "Esta solicitud ya fue utilizada para otro contacto", "IDEMPOTENCY_CONFLICT");
        }
        return retry;
      }
      await assertDniAvailable(organizationId, input.dni, undefined, dbSession);
      // Reception chooses among matches. Shared email/phone and names are never authentication or an automatic merge.
      if (email || phone) {
        const matches = await ContactModel.find({ organizationId, $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] }).session(dbSession);
        const legacy = await StudentModel.find({ organizationId, $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] }).session(dbSession);
        if (matches.length || legacy.length) throw new AppError(409, "Ya hay una persona con esos datos. Buscala y reutilizá su contacto", "CONTACT_MATCH_REQUIRES_REVIEW");
      }
      const [created] = await ContactModel.create([{ ...input, email, phone, organizationId }], { session: dbSession });
      await AuditLogModel.create([{ organizationId, actorUserId: request.auth!.userId, action: "CONTACT_CREATED", entityType: "Contact", entityId: created._id,
        metadata: { platform: created.source.platform } }], { session: dbSession });
      return created;
    });
    response.status(201).json(contact);
  } catch (error) { next(error); }
});

adminContactsRouter.get("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id), organizationId = request.auth!.organizationId;
    const contact = await resolveContact(organizationId, id);
    const [student, opportunities, trials, benefits, enrollments, attendance] = await Promise.all([
      StudentModel.findOne({ _id: id, organizationId }),
      OpportunityModel.find({ contactId: id, organizationId }).populate("classId", "name"),
      TrialBookingModel.find({ studentId: id, organizationId }).populate("classId", "name").sort({ scheduledFor: -1 }),
      TrialBenefitModel.find({ contactId: id, organizationId }),
      EnrollmentModel.find({ studentId: id, organizationId }).populate("classId", "name"),
      ClassAttendanceModel.find({ studentId: id, organizationId, status: "PRESENT" })
        .populate({ path: "sessionId", select: "sessionDate startTime classId", populate: { path: "classId", select: "name billingMode" } })
        .sort({ recordedAt: -1 })
    ]);
    response.json({ contact, student, opportunities, trials, benefits, enrollments, attendance });
  } catch (error) { next(error); }
});

adminContactsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id), organizationId = request.auth!.organizationId;
    const input = fields.partial().extend({ isActive: z.boolean().optional() }).parse(request.body);
    const keys = [`contact:${id}`, ...(input.dni ? [dniLockKey(input.dni)] : [])]; await ensureLocks(organizationId, keys);
    const contact = await withRequiredTransaction(async (dbSession) => {
      await touchLocks(organizationId, keys, dbSession);
      const contact = await resolveContact(organizationId, id, dbSession);
      const profile = await StudentModel.findOne({ _id: id, organizationId }).session(dbSession);
      await assertDniAvailable(organizationId, input.dni, id, dbSession);
      if (profile && input.branchId && input.branchId !== String(profile.branchId)) {
        throw new AppError(422, "Cambiá la sede desde la ficha académica del alumno", "USE_STUDENT_BRANCH_CHANGE");
      }
      if (input.branchId && !await BranchModel.exists({ _id: input.branchId, organizationId, isActive: true }).session(dbSession)) throw new AppError(422, "Sede no disponible", "INVALID_BRANCH");
      contact.set({ ...input, ...(input.email !== undefined ? { email: input.email.toLowerCase() || undefined } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.replace(/\D/g, "") || undefined } : {}) });
      await contact.save({ session: dbSession });
      // Academic operational deactivation belongs to Student, since it also closes enrollments.
      if (input.isActive === false && await StudentModel.exists({ _id: id, organizationId, isActive: true }).session(dbSession)) {
        throw new AppError(422, "Para dar de baja a un alumno usá su ficha académica", "USE_STUDENT_DEACTIVATION");
      }
      await StudentModel.updateOne({ _id: id, organizationId }, {
        $set: { firstName: contact.firstName, lastName: contact.lastName, contactId: contact._id,
          ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { phone: contact.phone } : {}), ...(contact.dni ? { dni: contact.dni } : {}) },
        $unset: { ...(!contact.email ? { email: 1 } : {}), ...(!contact.phone ? { phone: 1 } : {}), ...(!contact.dni ? { dni: 1 } : {}) }
      }, { session: dbSession });
      await AuditLogModel.create([{ organizationId, actorUserId: request.auth!.userId, action: "CONTACT_UPDATED", entityType: "Contact", entityId: contact._id,
        metadata: { changedFields: Object.keys(input) } }], { session: dbSession });
      return contact;
    });
    response.json(contact);
  } catch (error) { next(error); }
});

adminContactsRouter.post("/:id/opportunities", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id), organizationId = request.auth!.organizationId;
    const input = z.object({ classId: objectIdSchema, status: z.enum(OPPORTUNITY_STATUSES).default("OPEN"), notes: z.string().max(1000).optional(), followUpOn: calendarDateSchema.optional() }).parse(request.body);
    await resolveContact(organizationId, id);
    if (!await DanceClassModel.exists({ _id: input.classId, organizationId })) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    if (input.status === "CONVERTED") throw new AppError(422, "Convertí la prueba para crear la inscripción", "USE_TRIAL_CONVERSION");
    const item = await OpportunityModel.findOneAndUpdate({ organizationId, contactId: id, classId: input.classId }, { $set: input }, { upsert: true, new: true });
    await AuditLogModel.create({ organizationId, actorUserId: request.auth!.userId, action: "OPPORTUNITY_UPDATED", entityType: "Opportunity", entityId: item._id, metadata: { status: input.status } });
    response.json(item);
  } catch (error) { next(error); }
});
