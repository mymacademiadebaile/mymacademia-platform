import "dotenv/config";
import mongoose from "mongoose";
const { MongoClient } = mongoose.mongo;
type Database = NonNullable<typeof mongoose.connection.db>;

/** Build the entire plan before writing anything; ambiguities block apply. No model imports/autoIndex. */
export async function runIdentityMigration(db: Database, apply = false) {
  const students = await db.collection("students").find({}).toArray();
  const contacts = await db.collection("contacts").find({}).toArray();
  const trials = await db.collection("trialbookings").find({}).toArray();
  const known = new Set([...students, ...contacts].map((item) => String(item._id)));
  const writes: Array<() => Promise<unknown>> = [];
  const report = { mode: apply ? "APPLY_LOCAL" : "DRY_RUN", students: students.length, contactsMissing: 0,
    attendanceMissingIdentity: await db.collection("classattendances").countDocuments({ contactId: { $exists: false } }),
    trials: trials.length, issues: [] as Array<{ trialId: string; reason: string }> };
  for (const student of students) {
    if (!contacts.some((contact) => contact._id.equals(student._id))) {
      report.contactsMissing++;
      writes.push(() => db.collection("contacts").updateOne({ _id: student._id }, { $setOnInsert: {
        organizationId: student.organizationId, branchId: student.branchId, firstName: student.firstName, lastName: student.lastName,
        ...(student.email ? { email: student.email } : {}), ...(student.phone ? { phone: student.phone } : {}),
        source: { platform: "LEGACY_STUDENT", firstContactAt: student.createdAt },
        preferences: { emailReminders: true, marketing: false }, isActive: student.isActive, createdAt: student.createdAt, updatedAt: new Date()
      } }, { upsert: true }));
    }
    writes.push(() => db.collection("students").updateOne({ _id: student._id }, { $set: { contactId: student._id } }));
    writes.push(() => db.collection("classattendances").updateMany({ organizationId: student.organizationId, studentId: student._id }, { $set: { contactId: student._id } }));
  }
  const consumed = new Map<string, string>(), active = new Map<string, string>();
  for (const trial of trials) {
    let sessionId = trial.sessionId;
    const issue = (reason: string) => report.issues.push({ trialId: String(trial._id), reason });
    if (!known.has(String(trial.studentId))) { issue("IDENTITY_NOT_FOUND"); continue; }
    if (!sessionId) {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(trial.scheduledFor);
      const sessions = await db.collection("classsessions").find({ organizationId: trial.organizationId, classId: trial.classId, sessionDate: date }).toArray();
      if (sessions.length === 1) sessionId = sessions[0]._id;
      else { issue("SESSION_AMBIGUOUS"); continue; }
    }
    const present = await db.collection("classattendances").findOne({ organizationId: trial.organizationId, trialId: trial._id, status: "PRESENT" });
    if (!present && ["COMPLETED", "CONVERTED"].includes(trial.status) && !trial.consumedAt) { issue("COMPLETION_WITHOUT_ATTENDANCE_EVIDENCE"); continue; }
    const filter = { organizationId: trial.organizationId, contactId: trial.contactId ?? trial.studentId, classId: trial.classId };
    const key = `${filter.organizationId}:${filter.contactId}:${filter.classId}`;
    const prior = await db.collection("trialbenefits").findOne(filter);
    const isTrial = trial.kind !== "COURTESY";
    if (isTrial && (present || trial.consumedAt)) {
      const old = consumed.get(key) ?? (prior?.consumedBookingId ? String(prior.consumedBookingId) : undefined);
      if (old && old !== String(trial._id)) { issue("DUPLICATE_CONSUMPTION"); continue; }
      consumed.set(key, String(trial._id));
    } else if (isTrial && trial.status === "SCHEDULED") {
      if (active.has(key) || (prior?.activeBookingId && !prior.activeBookingId.equals(trial._id))) { issue("DUPLICATE_ACTIVE_RESERVATION"); continue; }
      active.set(key, String(trial._id));
    }
    const consumedAt = trial.consumedAt ?? (present ? present.recordedAt ?? present.updatedAt ?? new Date() : undefined);
    writes.push(() => db.collection("trialbookings").updateOne({ _id: trial._id }, { $set: {
      contactId: trial.studentId, kind: trial.kind ?? "TRIAL", sessionId, ...(consumedAt ? { consumedAt } : {})
    } }));
    if (isTrial) writes.push(() => db.collection("trialbenefits").updateOne(filter, {
      $setOnInsert: filter,
      ...(consumedAt ? { $set: { consumedBookingId: trial._id, consumedAt }, $unset: { activeBookingId: 1 } }
        : trial.status === "SCHEDULED" ? { $set: { activeBookingId: trial._id } } : {})
    }, { upsert: true }));
  }
  if (apply && report.issues.length) throw new Error("IDENTITY_MIGRATION_REQUIRES_REVIEW");
  if (apply) {
    for (const write of writes) await write();
    await db.collection("trialbenefits").createIndex({ organizationId: 1, contactId: 1, classId: 1 }, { unique: true });
    await db.collection("trialbookings").createIndex({ organizationId: 1, contactId: 1, classId: 1 }, { unique: true,
      partialFilterExpression: { contactId: { $type: "objectId" }, kind: "TRIAL", status: "SCHEDULED" } });
  }
  return report;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI no está configurada");
  const apply = process.argv.includes("--apply");
  if (apply && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(uri).hostname)) throw new Error("REMOTE_APPLY_DISABLED");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try { await client.connect(); console.log(JSON.stringify(await runIdentityMigration(client.db(), apply), null, 2)); }
  finally { await client.close(); }
}
if (require.main === module) {
  void main().catch(() => { console.error("Migración no aplicada: revisá la conexión y el informe dry-run; sólo se admite --apply en una copia local respaldada."); process.exitCode = 1; });
}
