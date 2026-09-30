import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import { academyNow, addDays, weekDayFor } from "../common/dates";
import { UserModel } from "../modules/auth/user.model";
import { CatalogItemModel } from "../modules/catalogs/catalog.model";
import { DanceClassModel } from "../modules/classes/class.model";
import { BranchModel } from "../modules/core/branch.model";
import { OrganizationModel } from "../modules/core/organization.model";
import { EnrollmentModel } from "../modules/enrollments/enrollment.model";
import { PaymentModel } from "../modules/payments/payment.model";
import { ProfessorModel } from "../modules/professors/professor.model";
import { ClassAttendanceModel } from "../modules/sessions/class-attendance.model";
import { ClassSessionModel } from "../modules/sessions/class-session.model";
import { StudentModel } from "../modules/students/student.model";

/**
 * Demo data for the professor portal. Never run against production.
 * Usage: MONGODB_URI=mongodb://127.0.0.1:27017/mym-demo tsx src/scripts/seed-professor-demo.ts
 * Login: juan.manrique@demo.com / Demo12345!
 */
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");
  await mongoose.connect(uri);

  const org = await OrganizationModel.create({ name: "M&M Demo", slug: "mym-demo" });
  const branch = await BranchModel.create({ organizationId: org._id, name: "La Plata" });
  const passwordHash = await bcrypt.hash("Demo12345!", 10);

  const mkProfessor = async (first: string, last: string) => {
    const user = await UserModel.create({
      organizationId: org._id,
      branchIds: [branch._id],
      email: `${first}.${last}@demo.com`.toLowerCase(),
      passwordHash,
      firstName: first,
      lastName: last,
      role: "PROFESSOR"
    });
    return ProfessorModel.create({
      organizationId: org._id,
      userId: user._id,
      displayName: `${first} ${last}`,
      instagram: `@${first.toLowerCase()}baila`,
      bio: "Profesor de baile social."
    });
  };
  const juan = await mkProfessor("Juan", "Manrique");
  const lucia = await mkProfessor("Lucia", "Ferrer");

  const catalog = (type: "DISCIPLINE" | "SEGMENT" | "LEVEL", name: string) =>
    CatalogItemModel.create({ organizationId: org._id, type, name, normalizedName: name.toLowerCase() });
  const bachata = await catalog("DISCIPLINE", "Bachata Sensual");
  const estilo = await catalog("DISCIPLINE", "Estilo Femenino");
  const adultos = await catalog("SEGMENT", "Adultos");
  const inicial = await catalog("LEVEL", "Inicial");
  const todos = await catalog("LEVEL", "Todos");

  const createdAt = new Date(Date.now() - 60 * 86_400_000);
  const bachataClass = await DanceClassModel.create({
    organizationId: org._id, branchId: branch._id, name: "Bachata Dance",
    professorIds: [juan._id], disciplineIds: [bachata._id], segmentIds: [adultos._id], levelIds: [inicial._id],
    capacity: 20, billingMode: "PER_CLASS", pricePerClass: 8000, monthlyPrice: 25000, freeTrialEnabled: true,
    schedules: [
      { day: "TUESDAY", startTime: "18:00", endTime: "19:00" },
      { day: "THURSDAY", startTime: "18:00", endTime: "19:00" }
    ],
    createdAt
  });
  const estiloClass = await DanceClassModel.create({
    organizationId: org._id, branchId: branch._id, name: "Estilo Femenino",
    professorIds: [juan._id], disciplineIds: [estilo._id], segmentIds: [adultos._id], levelIds: [todos._id],
    capacity: 15, billingMode: "MONTHLY", pricePerClass: 0, monthlyPrice: 25000,
    schedules: [{ day: "WEDNESDAY", startTime: "20:00", endTime: "21:00" }],
    createdAt
  });
  const luciaClass = await DanceClassModel.create({
    organizationId: org._id, branchId: branch._id, name: "Salsa Casino",
    professorIds: [lucia._id], disciplineIds: [bachata._id], segmentIds: [adultos._id], levelIds: [todos._id],
    capacity: 20, billingMode: "PER_CLASS", pricePerClass: 7000,
    schedules: [{ day: "TUESDAY", startTime: "18:00", endTime: "19:00" }],
    createdAt
  });

  const names: Array<[string, string]> = [
    ["Jorge", "Dominguez"], ["Ana", "Perez"], ["Martina", "Lopez"], ["Carlos", "Gomez"],
    ["Sofia", "Rossi"], ["Tomas", "Benitez"], ["Valentina", "Ruiz"], ["Nicolas", "Acosta"]
  ];
  const students: Array<{ _id: Types.ObjectId }> = [];
  for (const [first, last] of names) {
    students.push(
      await StudentModel.create({
        organizationId: org._id, branchId: branch._id, firstName: first, lastName: last,
        email: `${first}.${last}@mail.com`.toLowerCase(),
        phone: "221555" + String(1000 + students.length)
      })
    );
  }
  const outsider = await StudentModel.create({
    organizationId: org._id, branchId: branch._id, firstName: "Ajeno", lastName: "DeLucia"
  });
  await EnrollmentModel.create({
    organizationId: org._id, branchId: branch._id, classId: luciaClass._id, studentId: outsider._id
  });

  for (const student of students) {
    await EnrollmentModel.create({
      organizationId: org._id, branchId: branch._id, classId: bachataClass._id, studentId: student._id
    });
  }
  for (const student of students.slice(0, 5)) {
    await EnrollmentModel.create({
      organizationId: org._id, branchId: branch._id, classId: estiloClass._id, studentId: student._id
    });
  }

  // Six weeks of past sessions with attendance and payments.
  const today = academyNow().date;
  for (let date = addDays(today, -42); date <= today; date = addDays(date, 1)) {
    const day = weekDayFor(date);
    for (const danceClass of [bachataClass, estiloClass]) {
      const slot = danceClass.schedules.find((item) => item.day === day);
      if (!slot) continue;
      const session = await ClassSessionModel.create({
        organizationId: org._id, branchId: branch._id, classId: danceClass._id,
        sessionDate: date, startTime: slot.startTime, endTime: slot.endTime
      });
      const enrolled = danceClass === bachataClass ? students : students.slice(0, 5);
      for (const [index, student] of enrolled.entries()) {
        const seed = (index + Number(date.slice(8))) % 7;
        await ClassAttendanceModel.create({
          organizationId: org._id, sessionId: session._id, studentId: student._id,
          status: seed === 0 ? "ABSENT" : date === today ? "EXPECTED" : "PRESENT",
          updatedByUserId: juan.userId
        });
        if (danceClass === bachataClass && seed !== 1 && seed !== 2) {
          const classDate = new Date(date + "T12:00:00.000Z");
          await PaymentModel.create({
            organizationId: org._id, branchId: branch._id, studentId: student._id, classId: danceClass._id,
            paymentType: "PER_CLASS", classDate, concept: `Clase ${date.slice(8)}/${date.slice(5, 7)}`,
            period: date.slice(0, 7), amount: 8000, dueDate: classDate, status: "PAID", paidAt: classDate
          });
        }
      }
    }
  }
  for (const [index, student] of students.slice(0, 5).entries()) {
    await PaymentModel.create({
      organizationId: org._id, branchId: branch._id, studentId: student._id, classId: estiloClass._id,
      paymentType: "MONTHLY", concept: "Mensual", period: today.slice(0, 7), amount: 25000,
      dueDate: new Date(today.slice(0, 7) + "-10T12:00:00.000Z"), status: index < 3 ? "PAID" : "PENDING"
    });
  }

  console.log("Seed OK. Login: juan.manrique@demo.com / Demo12345!");
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
