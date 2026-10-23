import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { academyDateOf, isCalendarDate } from "../../common/dates";
import { generateSessions } from "../scheduling/session-generator";
import { ClassSessionModel } from "../sessions/class-session.model";
import { setSessionAttendance } from "../sessions/session-service";
import { TrialBookingModel } from "../trials/trial-booking.model";
import { bookTrial, cancelTrial, convertTrial } from "../trials/trial-service";
import { objectIdSchema } from "./admin.schemas";

const createSchema = z.object({
  classId: objectIdSchema.optional(), contactId: objectIdSchema.optional(), studentId: objectIdSchema.optional(),
  sessionId: objectIdSchema.optional(), scheduledFor: z.string().trim().max(60).optional(),
  kind: z.enum(["TRIAL", "COURTESY"]).default("TRIAL"), notes: z.string().trim().max(500).optional()
}).refine((input) => Boolean(input.contactId || input.studentId), "Seleccioná una persona");
const convertSchema = z.object({ billingPreference: z.enum(["PER_CLASS", "MONTHLY"]).optional(),
  seriesIds: z.array(objectIdSchema).min(1).max(14).optional(), scheduleKeys: z.array(z.string().min(1).max(64)).min(1).max(14).optional() });
const actorOf = (request: Express.Request) => ({ organizationId: request.auth!.organizationId, userId: request.auth!.userId });
export const adminTrialsRouter = Router();
adminTrialsRouter.get("/", async (request, response, next) => {
  try {
    const classId = objectIdSchema.parse(request.query.classId);
    response.json({ items: await TrialBookingModel.find({ organizationId: request.auth!.organizationId, classId })
      .populate("studentId", "firstName lastName email phone branchId isActive").sort({ scheduledFor: 1, createdAt: 1 }) });
  } catch (error) { next(error); }
});
adminTrialsRouter.post("/", async (request, response, next) => {
  try {
    const input = createSchema.parse(request.body);
    let sessionId = input.sessionId;
    if (!sessionId) {
      if (!input.classId || !input.scheduledFor) throw new AppError(422, "Seleccioná la sesión de la prueba", "TRIAL_SESSION_REQUIRED");
      const raw = input.scheduledFor;
      const day = isCalendarDate(raw) ? raw : academyDateOf(new Date(raw));
      if (!isCalendarDate(day)) throw new AppError(422, "La fecha no es válida", "INVALID_DATE");
      await generateSessions(request.auth!.organizationId, { from: day, to: day, classIds: [input.classId] });
      const sessions = await ClassSessionModel.find({ organizationId: request.auth!.organizationId, classId: input.classId, sessionDate: day, status: "SCHEDULED" });
      if (sessions.length !== 1) throw new AppError(422, sessions.length ? "Hay varios turnos ese día; seleccioná uno" : "La clase no se dicta ese día", "TRIAL_SESSION_REQUIRED");
      sessionId = String(sessions[0]._id);
    }
    response.status(201).json(await bookTrial(actorOf(request), { ...input, sessionId, contactId: input.contactId ?? input.studentId! }));
  } catch (error) { next(error); }
});
adminTrialsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { status } = z.object({ status: z.enum(["COMPLETED", "CANCELLED"]) }).parse(request.body);
    if (status === "CANCELLED") { response.json(await cancelTrial(actorOf(request), id)); return; }
    const trial = await TrialBookingModel.findOne({ _id: id, organizationId: request.auth!.organizationId });
    if (!trial?.sessionId) throw new AppError(409, "Asigná una sesión antes de confirmar la asistencia de esta prueba", "TRIAL_SESSION_REQUIRED");
    const session = await ClassSessionModel.findOne({ _id: trial.sessionId, organizationId: request.auth!.organizationId });
    if (!session) throw new AppError(404, "Sesión no encontrada", "CLASS_SESSION_NOT_FOUND");
    await setSessionAttendance(request.auth!.organizationId, session, String(trial.studentId), "PRESENT", request.auth!.userId, { origin: "ADMIN" });
    response.json(await TrialBookingModel.findById(id));
  } catch (error) { next(error); }
});
adminTrialsRouter.post("/:id/convert", async (request, response, next) => {
  try { response.json(await convertTrial(actorOf(request), objectIdSchema.parse(request.params.id), convertSchema.parse(request.body ?? {}))); }
  catch (error) { next(error); }
});
