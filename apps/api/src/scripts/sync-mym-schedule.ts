/**
 * Replaces the original demo timetable with M&M Academia's current timetable.
 *
 * The script is deliberately conservative:
 * - Existing class records are reused, so no class-related records are orphaned.
 * - Generated sessions are removed only after verifying they have no attendance,
 *   bookings, payments or trial bookings.
 * - The retired Bachata Jr. enrollments are closed, not deleted.
 *
 * Usage:
 *   pnpm --filter @mym/api sync:schedule -- --dry-run
 *   pnpm --filter @mym/api sync:schedule -- --yes
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import mongoose, { Types } from "mongoose";
import { slugify } from "../common/slug";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { CatalogItemModel } from "../modules/catalogs/catalog.model";
import { DanceClassModel } from "../modules/classes/class.model";
import { BranchModel } from "../modules/core/branch.model";
import { OrganizationModel } from "../modules/core/organization.model";
import { EnrollmentModel } from "../modules/enrollments/enrollment.model";
import { PaymentModel } from "../modules/payments/payment.model";
import { ProfessorModel } from "../modules/professors/professor.model";
import { ClassAttendanceModel } from "../modules/sessions/class-attendance.model";
import { ClassSessionModel } from "../modules/sessions/class-session.model";
import { SessionBookingModel } from "../modules/sessions/session-booking.model";
import { TrialBookingModel } from "../modules/trials/trial-booking.model";
import { UserModel } from "../modules/auth/user.model";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const confirmed = args.has("--yes");

type Day = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";
type Slot = { day: Day; startTime: string; endTime: string };
type ClassPlan = {
  legacyName: string;
  name: string;
  discipline: string;
  level?: "Inicial" | "Intermedio" | "Intensivo";
  professors: readonly string[];
  schedules: readonly Slot[];
};

const log = (message: string) => console.log(`${dryRun ? "[dry-run] " : ""}${message}`);
const normalized = (value: string) => value.trim().toLocaleLowerCase("es-AR");
const sameSlots = (
  left: readonly { day: string; startTime: string; endTime: string }[],
  right: readonly { day: string; startTime: string; endTime: string }[]
) =>
  left.length === right.length &&
  left.every((slot, index) => {
    const other = right[index];
    return other?.day === slot.day && other.startTime === slot.startTime && other.endTime === slot.endTime;
  });
const sameIds = (left: readonly Types.ObjectId[], right: readonly Types.ObjectId[]) =>
  left.length === right.length && left.every((id, index) => String(id) === String(right[index]));

const schedule = (day: Day, startTime: string, endTime: string): Slot => ({ day, startTime, endTime });

const twice = (startTime: string, endTime: string): Slot[] => [
  schedule("MONDAY", startTime, endTime),
  schedule("THURSDAY", startTime, endTime)
];

const PROFESSORS = [
  {
    legacyName: "Martín Quiroga",
    displayName: "Irii Barbe",
    disciplines: ["Bachata", "Stretching", "Bachata Estilo Femenino"],
    bioShort: "Bachata, stretching y bachata estilo femenino.",
    bio: "Profesora de bachata, stretching y bachata estilo femenino en M&M Academia."
  },
  {
    legacyName: "Jero Deluxe",
    displayName: "Jero Moreyra",
    disciplines: ["Bachata"],
    bioShort: "Bachata en pareja, desde inicial hasta intermedio.",
    bio: "Profesor de bachata en M&M Academia, junto a Irii Barbe."
  },
  {
    legacyName: "Vale Perello",
    displayName: "Vale Perello",
    disciplines: ["Full Body", "Pop Dance", "Femme Heels"],
    bioShort: "Full Body, Pop Dance Infantil y Femme Heels Intensivo.",
    bio: "Profesora de Full Body, Pop Dance Infantil y Femme Heels Intensivo en M&M Academia."
  },
  {
    legacyName: "Camila Brandán",
    displayName: "Gonza Godino",
    disciplines: ["Reggaetón"],
    bioShort: "Reggaetón con energía y entrenamiento coreográfico.",
    bio: "Profesor de Reggaetón en M&M Academia."
  },
  {
    legacyName: "Julián Ferrero",
    displayName: "Gisela Pérez",
    disciplines: ["Ritmos Latinos"],
    bioShort: "Ritmos Latinos para disfrutar y entrenar el baile.",
    bio: "Profesora de Ritmos Latinos en M&M Academia."
  },
  {
    legacyName: "Valentina Ríos",
    displayName: "Emilia Blotto",
    disciplines: ["Salsa"],
    bioShort: "Salsa en pareja, ritmo y musicalidad.",
    bio: "Profesora de Salsa en M&M Academia, junto a Jeremías Palavecino."
  },
  {
    legacyName: "Romina Acosta",
    displayName: "Jeremías Palavecino",
    disciplines: ["Salsa"],
    bioShort: "Salsa en pareja, conexión y musicalidad.",
    bio: "Profesor de Salsa en M&M Academia, junto a Emilia Blotto."
  }
] as const;

const DISCIPLINES = [
  { name: "Bachata", legacyName: "Bachata" },
  { name: "Reggaetón", legacyName: "Reggaetón" },
  { name: "Salsa", legacyName: "Salsa" },
  { name: "Ritmos Latinos", legacyName: "Ritmos Latinos" },
  { name: "Full Body", legacyName: "Full Body" },
  { name: "Stretching", legacyName: "Stretching" },
  { name: "Bachata Estilo Femenino", legacyName: "Estilo Femenino" },
  { name: "Pop Dance", legacyName: "Pop Dance" },
  { name: "Femme Heels", legacyName: "Feme Heels" }
] as const;

const CLASSES: readonly ClassPlan[] = [
  {
    legacyName: "Bachata Inicial",
    name: "Bachata Inicial · 19:00",
    discipline: "Bachata",
    level: "Inicial",
    professors: ["Irii Barbe", "Jero Moreyra"],
    schedules: twice("19:00", "20:00")
  },
  {
    legacyName: "Bachata Principiante",
    name: "Bachata Inicial · 20:00",
    discipline: "Bachata",
    level: "Inicial",
    professors: ["Irii Barbe", "Jero Moreyra"],
    schedules: twice("20:00", "21:00")
  },
  {
    legacyName: "Bachata Intermedio",
    name: "Bachata Intermedio",
    discipline: "Bachata",
    level: "Intermedio",
    professors: ["Irii Barbe", "Jero Moreyra"],
    schedules: twice("21:00", "22:00")
  },
  {
    legacyName: "Bachata Entrenamiento",
    name: "Full Body",
    discipline: "Full Body",
    professors: ["Vale Perello"],
    schedules: [schedule("TUESDAY", "15:00", "16:00"), schedule("THURSDAY", "15:00", "16:00")]
  },
  {
    legacyName: "Fitdance",
    name: "Reggaetón",
    discipline: "Reggaetón",
    professors: ["Gonza Godino"],
    schedules: [schedule("TUESDAY", "19:00", "21:00")]
  },
  {
    legacyName: "Stretching",
    name: "Stretching",
    discipline: "Stretching",
    professors: ["Irii Barbe"],
    schedules: [schedule("WEDNESDAY", "15:00", "16:00")]
  },
  {
    legacyName: "Femme Inicial",
    name: "Bachata Estilo Femenino · Inicial",
    discipline: "Bachata Estilo Femenino",
    level: "Inicial",
    professors: ["Irii Barbe"],
    schedules: [schedule("WEDNESDAY", "19:00", "20:00")]
  },
  {
    legacyName: "Salsa",
    name: "Salsa",
    discipline: "Salsa",
    professors: ["Emilia Blotto", "Jeremías Palavecino"],
    schedules: [schedule("WEDNESDAY", "20:00", "21:00"), schedule("FRIDAY", "19:00", "20:00")]
  },
  {
    legacyName: "Femme Intermedio",
    name: "Ritmos Latinos",
    discipline: "Ritmos Latinos",
    professors: ["Gisela Pérez"],
    schedules: [schedule("WEDNESDAY", "21:00", "22:00"), schedule("FRIDAY", "21:00", "22:00")]
  },
  {
    legacyName: "Pop Dance",
    name: "Pop Dance Infantil",
    discipline: "Pop Dance",
    professors: ["Vale Perello"],
    schedules: [schedule("SATURDAY", "13:00", "15:00")]
  },
  {
    legacyName: "Femme Heels Intensivo",
    name: "Femme Heels Intensivo",
    discipline: "Femme Heels",
    level: "Intensivo",
    professors: ["Vale Perello"],
    schedules: [schedule("SATURDAY", "19:00", "22:00")]
  }
];

async function main() {
  if (!dryRun && !confirmed) {
    throw new Error("Usá --dry-run para revisar el plan o --yes para aplicarlo.");
  }

  await connectDatabase();
  const organization = await OrganizationModel.findOne({ slug: "mym-academia" });
  if (!organization) throw new Error('No existe la organización "mym-academia".');
  const organizationId = organization._id;
  const branch = await BranchModel.findOne({ organizationId, isActive: true }).sort({ createdAt: 1 });
  if (!branch) throw new Error("No hay una sede activa para la organización.");

  const backup: Record<string, unknown> = {
    createdAt: new Date().toISOString(),
    organizationId: String(organizationId),
    professors: [],
    users: [],
    disciplines: [],
    classes: [],
    retiredEnrollments: []
  };
  const professorsBackup = backup.professors as unknown[];
  const usersBackup = backup.users as unknown[];
  const disciplinesBackup = backup.disciplines as unknown[];
  const classesBackup = backup.classes as unknown[];
  const enrollmentsBackup = backup.retiredEnrollments as unknown[];
  let shouldResetGeneratedSessions = false;

  const level = await CatalogItemModel.findOne({ organizationId, type: "LEVEL", normalizedName: normalized("Inicial") });
  const intermediateLevel = await CatalogItemModel.findOne({ organizationId, type: "LEVEL", normalizedName: normalized("Intermedio") });
  const intensiveLevel = await CatalogItemModel.findOne({ organizationId, type: "LEVEL", normalizedName: normalized("Intensivo") });
  const adults = await CatalogItemModel.findOne({ organizationId, type: "SEGMENT", normalizedName: normalized("Adultos") });
  const children = await CatalogItemModel.findOne({ organizationId, type: "SEGMENT", normalizedName: normalized("Infantil") });
  if (!level || !intermediateLevel || !intensiveLevel || !adults || !children) {
    throw new Error("Faltan niveles o segmentos requeridos en el catálogo.");
  }

  const disciplineId = new Map<string, Types.ObjectId>();
  for (const item of DISCIPLINES) {
    const catalog = await CatalogItemModel.findOne({
      organizationId,
      type: "DISCIPLINE",
      normalizedName: { $in: [normalized(item.legacyName), normalized(item.name)] }
    });
    if (!catalog) throw new Error(`No existe el ritmo de prueba "${item.legacyName}".`);
    disciplinesBackup.push({ id: catalog.id, before: catalog.toObject() });
    log(`ritmo: ${catalog.name} → ${item.name}`);
    if (!dryRun) {
      catalog.name = item.name;
      catalog.normalizedName = normalized(item.name);
      catalog.isActive = true;
      // A public rhythm requires approved marketing copy and a cover image. Keep it
      // unpublished until those real assets are supplied, rather than showing demo media.
      catalog.publishOnWeb = false;
      await catalog.save();
    }
    disciplineId.set(item.name, catalog._id);
  }

  const professorId = new Map<string, Types.ObjectId>();
  for (const item of PROFESSORS) {
    const professor = await ProfessorModel.findOne({ organizationId, displayName: { $in: [item.legacyName, item.displayName] } });
    if (!professor) throw new Error(`No existe el profesor de prueba "${item.legacyName}".`);
    const user = await UserModel.findById(professor.userId);
    if (!user) throw new Error(`El profesor "${item.legacyName}" no tiene usuario asociado.`);
    const [firstName, ...lastNameParts] = item.displayName.split(" ");

    professorsBackup.push({ id: professor.id, before: professor.toObject() });
    usersBackup.push({ id: user.id, before: user.toObject() });
    log(`profesor: ${item.legacyName} → ${item.displayName}`);
    if (!dryRun) {
      user.firstName = firstName!;
      user.lastName = lastNameParts.join(" ");
      user.role = "PROFESSOR";
      user.branchIds = [branch._id];
      user.isActive = true;
      await user.save();

      professor.displayName = item.displayName;
      professor.disciplineIds = item.disciplines.map((name) => disciplineId.get(name)!);
      professor.bioShort = item.bioShort;
      professor.bio = item.bio;
      professor.slug = slugify(item.displayName);
      professor.isActive = true;
      // Do not associate real people with the former demo portraits.
      professor.avatarUrl = undefined;
      professor.introVideoUrl = undefined;
      professor.publishOnWeb = false;
      await professor.save();
    }
    professorId.set(item.displayName, professor._id);
  }

  const affectedClassIds: Types.ObjectId[] = [];
  for (const item of CLASSES) {
    const danceClass = await DanceClassModel.findOne({ organizationId, name: { $in: [item.legacyName, item.name] } });
    if (!danceClass) throw new Error(`No existe la clase de prueba "${item.legacyName}".`);
    affectedClassIds.push(danceClass._id);
    classesBackup.push({ id: danceClass.id, before: danceClass.toObject() });
    const expectedProfessorIds = item.professors.map((name) => professorId.get(name)!);
    if (
      danceClass.name !== item.name ||
      danceClass.status !== "ACTIVE" ||
      !sameSlots(danceClass.schedules, item.schedules) ||
      !sameIds(danceClass.professorIds, expectedProfessorIds)
    ) {
      shouldResetGeneratedSessions = true;
    }
    log(`clase: ${item.legacyName} → ${item.name}`);
    if (!dryRun) {
      danceClass.name = item.name;
      danceClass.branchId = branch._id;
      danceClass.disciplineIds = [disciplineId.get(item.discipline)!];
      danceClass.professorIds = expectedProfessorIds;
      danceClass.segmentIds = [item.name === "Pop Dance Infantil" ? children._id : adults._id];
      danceClass.levelIds =
        item.level === "Inicial" ? [level._id] : item.level === "Intermedio" ? [intermediateLevel._id] : item.level === "Intensivo" ? [intensiveLevel._id] : [];
      danceClass.schedules = [...item.schedules];
      danceClass.status = "ACTIVE";
      danceClass.publishOnWeb = false;
      await danceClass.save();
    }
  }

  const retiredClass = await DanceClassModel.findOne({ organizationId, name: "Bachata Jr." });
  if (!retiredClass) throw new Error('No existe la clase de prueba "Bachata Jr.".');
  affectedClassIds.push(retiredClass._id);
  const retiredEnrollments = await EnrollmentModel.find({ classId: retiredClass._id, status: "ACTIVE" });
  classesBackup.push({ id: retiredClass.id, before: retiredClass.toObject() });
  enrollmentsBackup.push(...retiredEnrollments.map((enrollment) => ({ id: enrollment.id, before: enrollment.toObject() })));
  if (retiredClass.status !== "INACTIVE" || retiredClass.schedules.length > 0 || retiredEnrollments.length > 0) {
    shouldResetGeneratedSessions = true;
  }
  log(`retirar: Bachata Jr. y cerrar ${retiredEnrollments.length} inscripción(es) de prueba`);

  const [payments, trials] = await Promise.all([
    PaymentModel.countDocuments({ classId: { $in: affectedClassIds } }),
    TrialBookingModel.countDocuments({ classId: { $in: affectedClassIds } })
  ]);
  const sessions = await ClassSessionModel.find({ classId: { $in: affectedClassIds } }).select("_id").lean();
  const sessionIds = sessions.map((session) => session._id);
  const [attendance, bookings] = await Promise.all([
    sessionIds.length ? ClassAttendanceModel.countDocuments({ sessionId: { $in: sessionIds } }) : 0,
    sessionIds.length ? SessionBookingModel.countDocuments({ sessionId: { $in: sessionIds } }) : 0
  ]);
  if (shouldResetGeneratedSessions && (payments || trials || attendance || bookings)) {
    throw new Error(
      `No se puede reemplazar el calendario: hay registros vinculados (pagos: ${payments}, pruebas: ${trials}, asistencias: ${attendance}, reservas: ${bookings}).`
    );
  }
  log(
    shouldResetGeneratedSessions
      ? `eliminar ${sessions.length} sesión(es) generada(s) de prueba sin actividad`
      : `mantener ${sessions.length} sesión(es) ya generada(s) para el cronograma vigente`
  );

  if (!dryRun) {
    retiredClass.status = "INACTIVE";
    retiredClass.publishOnWeb = false;
    retiredClass.schedules = [];
    await retiredClass.save();
    if (retiredEnrollments.length) {
      await EnrollmentModel.updateMany(
        { _id: { $in: retiredEnrollments.map((enrollment) => enrollment._id) } },
        { $set: { status: "INACTIVE", endedAt: new Date() } }
      );
    }
    if (shouldResetGeneratedSessions && sessionIds.length) {
      await ClassSessionModel.deleteMany({ _id: { $in: sessionIds } });
    }

    const backupPath = join(tmpdir(), "mym-schedule-sync-before.json");
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    log(`respaldo local creado: ${backupPath}`);
  }

  log("Cronograma listo: 11 clases activas y 7 profesores asignados.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => undefined);
  });
