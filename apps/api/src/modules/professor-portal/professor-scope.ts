import type { Request } from "express";
import { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ProfessorModel } from "../professors/professor.model";
import { UserModel } from "../auth/user.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { StudentModel } from "../students/student.model";

export interface ProfessorContext {
  organizationId: string;
  userId: string;
  user: any;
  professor: any;
}

/** Resolves the authenticated professor; every portal query starts from this scope. */
export async function loadProfessorContext(request: Request): Promise<ProfessorContext> {
  const organizationId = request.auth!.organizationId;
  const userId = request.auth!.userId;

  const [user, professor] = await Promise.all([
    UserModel.findOne({ _id: userId, organizationId, role: "PROFESSOR", isActive: true }).select(
      "firstName lastName email phone branchIds"
    ),
    ProfessorModel.findOne({ organizationId, userId, isActive: true }).populate(
      "disciplineIds",
      "name type"
    )
  ]);

  if (!user || !professor) {
    throw new AppError(
      404,
      "Perfil de profesor no encontrado o inactivo",
      "PROFESSOR_PROFILE_NOT_FOUND"
    );
  }

  return { organizationId, userId, user, professor };
}

/** Classes assigned to the professor. `professorIds` membership is the ownership rule. */
export async function ownedClasses(
  context: ProfessorContext,
  options: { activeOnly?: boolean; classId?: string } = {}
) {
  const filter: Record<string, unknown> = {
    organizationId: context.organizationId,
    professorIds: context.professor._id
  };
  if (options.activeOnly) filter.status = "ACTIVE";
  if (options.classId) filter._id = options.classId;

  return DanceClassModel.find(filter)
    .populate("disciplineIds segmentIds levelIds", "name type")
    .sort({ name: 1 })
    .lean<any[]>();
}

/** Session + class if — and only if — the class belongs to the professor. */
export async function loadOwnedSession(context: ProfessorContext, sessionId: string) {
  const session = await ClassSessionModel.findOne({
    _id: sessionId,
    organizationId: context.organizationId
  }).lean<any>();

  const notFound = () =>
    new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  if (!session) throw notFound();

  const [danceClass] = await ownedClasses(context, { classId: String(session.classId) });
  if (!danceClass) throw notFound();

  return { session, danceClass };
}

/** Student if — and only if — they have an ACTIVE enrollment in a class of the professor. */
export async function loadOwnedStudent(context: ProfessorContext, studentId: string) {
  const classes = await ownedClasses(context);
  const classIds = classes.map((item) => item._id as Types.ObjectId);

  const enrollments = classIds.length
    ? await EnrollmentModel.find({
        organizationId: context.organizationId,
        classId: { $in: classIds },
        studentId,
        status: "ACTIVE"
      }).lean<any[]>()
    : [];

  const student = enrollments.length
    ? await StudentModel.findOne({
        _id: studentId,
        organizationId: context.organizationId,
        isActive: true
      })
        .select("firstName lastName email phone isActive")
        .lean<any>()
    : null;

  if (!student) {
    throw new AppError(404, "Alumno no encontrado", "STUDENT_NOT_FOUND");
  }

  return { student, classes, enrollments };
}
