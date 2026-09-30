/**
 * Demo content for the public website: rhythms, professors, levels and the weekly
 * classes of the current schedule, published and with stock photos on Cloudinary.
 *
 *   pnpm --filter @mym/api seed:public-demo -- --dry-run   # show the plan, write nothing
 *   pnpm --filter @mym/api seed:public-demo -- --yes       # apply
 *   pnpm --filter @mym/api seed:public-demo -- --remove --yes
 *
 * Safe to re-run: everything is looked up before it is created. Demo professors use
 * @demo.mym.test emails, which is how --remove finds them. Existing records are never
 * deleted; the ones that get modified are saved to a JSON backup first.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose, { Types } from "mongoose";
import { slugify, uniqueSlug } from "../common/slug";
import { connectDatabase, disconnectDatabase } from "../database/connect";
import { UserModel } from "../modules/auth/user.model";
import { CatalogItemModel } from "../modules/catalogs/catalog.model";
import { DanceClassModel } from "../modules/classes/class.model";
import { BranchModel } from "../modules/core/branch.model";
import { OrganizationModel } from "../modules/core/organization.model";
import { ProfessorModel } from "../modules/professors/professor.model";
import { getCloudinary } from "../services/cloudinary";
import {
  deleteProfessorMedia,
  deleteRhythmImage,
  uploadProfessorAvatar,
  uploadRhythmImage
} from "../services/professor-media";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const REMOVE = args.has("--remove");
const CONFIRMED = args.has("--yes");

const DEMO_EMAIL_DOMAIN = "demo.mym.test";
const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=1400&q=80&fm=jpg&fit=max`;

type Day = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";
interface Slot {
  day: Day;
  start: string;
  end: string;
}

interface RhythmSeed {
  key: string;
  name: string;
  tagline: string;
  description: string;
  photo: string;
}

const RHYTHMS: RhythmSeed[] = [
  {
    key: "bachata",
    name: "Bachata",
    tagline: "Conexión, musicalidad y ritmo en pareja.",
    description:
      "La bachata es un baile de pareja que se aprende escuchando la música y al otro. En las clases trabajamos el paso base, la marca y el seguimiento, los giros y la musicalidad.\n\nHay niveles para empezar desde cero, para seguir creciendo y un espacio de entrenamiento para practicar con más ritmo.",
    photo: "1754684223558-2cd0e4b518ed"
  },
  {
    key: "salsa",
    name: "Salsa",
    tagline: "Giros, cadencia y mucha energía en pareja.",
    description:
      "La salsa se baila en pareja, con giros, cambios de ritmo y mucho juego entre quien marca y quien sigue.\n\nEn clase practicás el paso base, las vueltas y el tiempo musical para animarte a bailar en cualquier pista.",
    photo: "1575449235878-6de79c4c8ef4"
  },
  {
    key: "femme",
    name: "Estilo Femenino",
    tagline: "Brazos, cadera, giros y presencia propia.",
    description:
      "Estilo Femenino es una clase individual: no necesitás pareja. Se trabaja la técnica de brazos, cadera y giros, y la manera de interpretar la música con el cuerpo.\n\nTambién hay una clase intensiva con tacos (Heels) para quienes quieren sumar técnica y postura.",
    photo: "1638317875669-719f70b4c27c"
  },
  {
    key: "pop",
    name: "Pop Dance",
    tagline: "Coreografías con la música del momento.",
    description:
      "Clases de coreografía con música pop actual. Se aprende una secuencia completa, se practica en grupo y se trabaja la expresión y la memoria corporal.",
    photo: "1758526387607-8a02d16ea86a"
  },
  {
    key: "fitdance",
    name: "Fitdance",
    tagline: "Bailar y entrenar al mismo tiempo.",
    description:
      "Una clase para moverte, sudar y divertirte con música. Combina pasos de baile sencillos con trabajo aeróbico, sin necesidad de experiencia previa.",
    photo: "1524594152303-9fd13543fe6e"
  },
  {
    key: "stretching",
    name: "Stretching",
    tagline: "Elongación y movilidad para bailar mejor.",
    description:
      "Clase de elongación y movilidad articular. Ayuda a ganar flexibilidad, a cuidar el cuerpo y a recuperarte entre clases de baile.",
    photo: "1779406166545-6730f1249fdf"
  }
];

interface ProfessorSeed {
  key: string;
  displayName: string;
  firstName: string;
  lastName: string;
  bioShort: string;
  bio: string;
  photo: string;
  rhythms: string[];
}

const PROFESSORS: ProfessorSeed[] = [
  {
    key: "martin",
    displayName: "Martín Quiroga",
    firstName: "Martín",
    lastName: "Quiroga",
    bioShort: "Bachata desde la base: marca clara, pasos simples y mucha musicalidad.",
    bio: "Da clases en los primeros niveles de bachata, con foco en que cada persona entienda el paso base y la conexión con su pareja.\n\nSu forma de enseñar es paciente y práctica: poca teoría, mucha repetición y buena música.",
    photo: "1761882612894-f51655cfa6c7",
    rhythms: ["bachata"]
  },
  {
    key: "camila",
    displayName: "Camila Brandán",
    firstName: "Camila",
    lastName: "Brandán",
    bioShort: "Técnica, postura y conexión en los niveles inicial, intermedio y entrenamiento.",
    bio: "Acompaña a los grupos que ya tienen base y quieren pulir giros, postura y musicalidad.\n\nLe gusta que las clases se sientan como un ensayo compartido.",
    photo: "1762635696772-0ed637b1a3a7",
    rhythms: ["bachata"]
  },
  {
    key: "julian",
    displayName: "Julián Ferrero",
    firstName: "Julián",
    lastName: "Ferrero",
    bioShort: "Bachata y salsa con energía: giros, cambios de ritmo y diversión.",
    bio: "Da clases de bachata en nivel intermedio y entrenamiento, y de salsa.\n\nBusca que todos se animen a bailar con cualquier pareja y a disfrutar de la pista.",
    photo: "1597754298097-fb51c3ec8ac8",
    rhythms: ["bachata", "salsa"]
  },
  {
    key: "valentina",
    displayName: "Valentina Ríos",
    firstName: "Valentina",
    lastName: "Ríos",
    bioShort: "Estilo femenino y heels: presencia, control del cuerpo y confianza.",
    bio: "Dicta las clases de Estilo Femenino, en nivel inicial e intermedio, y el intensivo de heels de los sábados.\n\nTrabaja la técnica de brazos, cadera y giros, y la actitud al bailar.",
    photo: "1625355049460-12d4e15478d9",
    rhythms: ["femme"]
  },
  {
    key: "agustina",
    displayName: "Agustina Paz",
    firstName: "Agustina",
    lastName: "Paz",
    bioShort: "Coreografías y entrenamiento para moverte a full.",
    bio: "Da Pop Dance y Fitdance, y acompaña el intensivo de heels.\n\nLas clases son dinámicas, con coreografías que se aprenden rápido y mucha música.",
    photo: "1593105722399-0ee263656fdd",
    rhythms: ["pop", "fitdance", "femme"]
  },
  {
    key: "romina",
    displayName: "Romina Acosta",
    firstName: "Romina",
    lastName: "Acosta",
    bioShort: "Salsa y stretching: ritmo para bailar y movilidad para cuidarte.",
    bio: "Da salsa junto a Julián y la clase de stretching de los miércoles.\n\nLe importa que cada persona conozca su cuerpo y baile sin dolor.",
    photo: "1579539760267-b2e78d9d735e",
    rhythms: ["salsa", "stretching"]
  }
];

type ClassSeed = {
  name: string;
  rhythm: string;
  level?: string;
  professors: string[];
  slots: Slot[];
};

const twice = (start: string, end: string): Slot[] => [
  { day: "MONDAY", start, end },
  { day: "THURSDAY", start, end }
];

// Bachata "Jr." (Mon/Thu 18:00) is not created: the class "Bachata Dance" already covers that slot.
const CLASSES: ClassSeed[] = [
  { name: "Bachata Inicial", rhythm: "bachata", level: "Inicial", professors: ["martin", "camila"], slots: twice("19:00", "20:00") },
  { name: "Bachata Principiante", rhythm: "bachata", level: "Principiante", professors: ["martin"], slots: twice("20:00", "21:00") },
  { name: "Bachata Intermedio", rhythm: "bachata", level: "Intermedio", professors: ["camila", "julian"], slots: twice("21:00", "22:00") },
  { name: "Bachata Entrenamiento", rhythm: "bachata", level: "Entrenamiento", professors: ["julian", "camila"], slots: twice("22:00", "23:00") },
  {
    name: "Salsa",
    rhythm: "salsa",
    professors: ["julian", "romina"],
    slots: [
      { day: "TUESDAY", start: "19:00", end: "20:00" },
      { day: "FRIDAY", start: "19:00", end: "20:00" }
    ]
  },
  { name: "Fitdance", rhythm: "fitdance", professors: ["agustina"], slots: [{ day: "TUESDAY", start: "15:00", end: "16:00" }] },
  { name: "Stretching", rhythm: "stretching", professors: ["romina"], slots: [{ day: "WEDNESDAY", start: "14:00", end: "15:00" }] },
  { name: "Femme Inicial", rhythm: "femme", level: "Inicial", professors: ["valentina"], slots: [{ day: "WEDNESDAY", start: "19:00", end: "20:00" }] },
  { name: "Femme Intermedio", rhythm: "femme", level: "Intermedio", professors: ["valentina"], slots: [{ day: "FRIDAY", start: "20:00", end: "21:00" }] },
  { name: "Pop Dance", rhythm: "pop", professors: ["agustina"], slots: [{ day: "SATURDAY", start: "13:00", end: "16:00" }] },
  {
    name: "Femme Heels Intensivo",
    rhythm: "femme",
    level: "Intensivo",
    professors: ["valentina", "agustina"],
    slots: [{ day: "SATURDAY", start: "19:00", end: "22:00" }]
  }
];

const NEW_LEVELS = ["Jr.", "Principiante", "Entrenamiento", "Intensivo"];
const log = (message: string) => console.log(`${DRY_RUN ? "[dry-run] " : ""}${message}`);
const normalize = (name: string) => name.trim().toLocaleLowerCase("es-AR");

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Photo download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function firstSentence(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const match = flat.match(/^.*?[.!?](?=\s|$)/);
  const sentence = match ? match[0] : flat;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

async function apply() {
  const organization = await OrganizationModel.findOne({ slug: "mym-academia" });
  if (!organization) throw new Error('Organization "mym-academia" not found');
  const organizationId = organization._id;
  const branch = await BranchModel.findOne({ organizationId, isActive: true }).sort({ createdAt: 1 });
  if (!branch) throw new Error("No active branch found");

  const backup: Record<string, unknown> = { createdAt: new Date().toISOString(), modified: [] };
  const modified = backup.modified as unknown[];

  // ---- levels and segment
  const levelId = new Map<string, Types.ObjectId>();
  const existingLevels = await CatalogItemModel.find({ organizationId, type: "LEVEL" });
  let nextLevelOrder = existingLevels.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
  for (const name of ["Inicial", "Intermedio", ...NEW_LEVELS]) {
    const found = existingLevels.find((item) => item.normalizedName === normalize(name));
    if (found) {
      levelId.set(name, found._id);
      continue;
    }
    log(`+ nivel "${name}"`);
    if (!DRY_RUN) {
      const created = await CatalogItemModel.create({
        organizationId,
        type: "LEVEL",
        name,
        normalizedName: normalize(name),
        sortOrder: nextLevelOrder++
      });
      levelId.set(name, created._id);
    }
  }
  const adults = await CatalogItemModel.findOne({ organizationId, type: "SEGMENT", normalizedName: "adultos" });
  if (!adults) throw new Error('Segment "Adultos" not found');

  // ---- rhythms
  const rhythmId = new Map<string, Types.ObjectId>();
  const lastDiscipline = await CatalogItemModel.findOne({ organizationId, type: "DISCIPLINE" }).sort({ sortOrder: -1 });
  let nextRhythmOrder = (lastDiscipline?.sortOrder ?? -1) + 1;
  for (const seed of RHYTHMS) {
    let item = await CatalogItemModel.findOne({ organizationId, type: "DISCIPLINE", normalizedName: normalize(seed.name) });
    const isNew = !item;
    if (item) {
      modified.push({
        collection: "CatalogItem",
        id: item.id,
        name: item.name,
        before: {
          isActive: item.isActive,
          tagline: item.tagline ?? null,
          description: item.description ?? null,
          image: item.image ?? null,
          slug: item.slug ?? null,
          publishOnWeb: item.publishOnWeb ?? false
        }
      });
      log(`~ ritmo "${seed.name}" (existente: ${item.isActive ? "activo" : "inactivo → se reactiva"}, se publica)`);
    } else {
      log(`+ ritmo "${seed.name}"`);
    }
    if (DRY_RUN) continue;

    if (!item) {
      item = await CatalogItemModel.create({
        organizationId,
        type: "DISCIPLINE",
        name: seed.name,
        normalizedName: normalize(seed.name),
        sortOrder: nextRhythmOrder++
      });
    }
    if (!item.image?.url) {
      const upload = await uploadRhythmImage(await download(unsplash(seed.photo)), String(organizationId), item.id);
      item.image = { url: upload.secure_url, width: upload.width, height: upload.height };
    }
    item.isActive = true;
    item.tagline = item.tagline || seed.tagline;
    item.description = item.description || seed.description;
    item.slug =
      item.slug ||
      (await uniqueSlug(item.name, async (candidate) =>
        Boolean(await CatalogItemModel.exists({ organizationId, type: "DISCIPLINE", slug: candidate, _id: { $ne: item!._id } }))
      ));
    item.publishOnWeb = true;
    await item.save();
    rhythmId.set(seed.key, item._id);
    if (isNew) log(`  creado: /clases/${item.slug}-la-plata`);
  }

  // ---- professors
  const professorId = new Map<string, Types.ObjectId>();
  for (const seed of PROFESSORS) {
    const email = `${slugify(seed.displayName)}@${DEMO_EMAIL_DOMAIN}`;
    const existingUser = await UserModel.findOne({ organizationId, email });
    let professor = existingUser ? await ProfessorModel.findOne({ organizationId, userId: existingUser._id }) : null;
    log(`${professor ? "=" : "+"} profesor "${seed.displayName}"${professor ? " (ya existe)" : ""}`);
    if (DRY_RUN) continue;

    if (!professor) {
      const user = await UserModel.create({
        organizationId,
        branchIds: [branch._id],
        email,
        // Nobody is meant to log in as a demo professor: unusable random password.
        passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
        firstName: seed.firstName,
        lastName: seed.lastName,
        role: "PROFESSOR"
      });
      professor = await ProfessorModel.create({
        organizationId,
        userId: user._id,
        displayName: seed.displayName,
        disciplineIds: seed.rhythms.map((key) => rhythmId.get(key)!).filter(Boolean),
        bioShort: seed.bioShort,
        bio: seed.bio
      });
    }
    if (!professor.avatarUrl) {
      const upload = await uploadProfessorAvatar(await download(unsplash(seed.photo)), String(organizationId), professor.id);
      professor.avatarUrl = upload.secure_url;
    }
    professor.slug =
      professor.slug ||
      (await uniqueSlug(seed.displayName, async (candidate) =>
        Boolean(await ProfessorModel.exists({ organizationId, slug: candidate, _id: { $ne: professor!._id } }))
      ));
    professor.publishOnWeb = true;
    await professor.save();
    professorId.set(seed.key, professor._id);
  }

  // ---- classes
  for (const seed of CLASSES) {
    const exists = await DanceClassModel.exists({ organizationId, name: seed.name });
    log(`${exists ? "=" : "+"} clase "${seed.name}"${exists ? " (ya existe)" : ""}`);
    if (DRY_RUN || exists) continue;

    await DanceClassModel.create({
      organizationId,
      branchId: branch._id,
      name: seed.name,
      professorIds: seed.professors.map((key) => professorId.get(key)!),
      disciplineIds: [rhythmId.get(seed.rhythm)!],
      segmentIds: [adults._id],
      levelIds: seed.level ? [levelId.get(seed.level)!] : [],
      capacity: 20,
      billingMode: "BOTH",
      pricePerClass: 9000,
      monthlyPrice: 28000,
      schedules: seed.slots.map((slot) => ({ day: slot.day, startTime: slot.start, endTime: slot.end })),
      status: "ACTIVE",
      publishOnWeb: true
    });
  }

  // ---- existing professors: publish only if they already have what the website needs
  const real = await ProfessorModel.find({ organizationId, isActive: true, publishOnWeb: { $ne: true } });
  for (const professor of real) {
    const user = await UserModel.findById(professor.userId).select("email");
    if (user?.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) continue;

    const bioShort = professor.bioShort || (professor.bio ? firstSentence(professor.bio) : "");
    if (!professor.avatarUrl || !bioShort) {
      log(`! "${professor.displayName}" no se publica: falta ${!professor.avatarUrl ? "la foto" : "la descripción"}`);
      continue;
    }
    log(`~ profesor existente "${professor.displayName}" → se publica (descripción corta: "${bioShort}")`);
    if (DRY_RUN) continue;
    modified.push({
      collection: "Professor",
      id: professor.id,
      name: professor.displayName,
      before: { bioShort: professor.bioShort ?? null, slug: professor.slug ?? null, publishOnWeb: professor.publishOnWeb ?? false }
    });
    professor.bioShort = bioShort;
    professor.slug =
      professor.slug ||
      (await uniqueSlug(professor.displayName, async (candidate) =>
        Boolean(await ProfessorModel.exists({ organizationId, slug: candidate, _id: { $ne: professor._id } }))
      ));
    professor.publishOnWeb = true;
    await professor.save();
  }

  if (!DRY_RUN) {
    const file = join(tmpdir(), "mym-seed-public-demo-before.json");
    writeFileSync(file, JSON.stringify(backup, null, 2));
    log(`\nRespaldo del estado anterior de lo modificado: ${file}`);
  }
}

async function remove() {
  const organization = await OrganizationModel.findOne({ slug: "mym-academia" });
  if (!organization) throw new Error('Organization "mym-academia" not found');
  const organizationId = organization._id;

  const users = await UserModel.find({ organizationId, email: new RegExp(`@${DEMO_EMAIL_DOMAIN.replace(/\./g, "\\.")}$`) }).select("_id");
  const professors = await ProfessorModel.find({ organizationId, userId: { $in: users.map((user) => user._id) } });
  const professorIds = professors.map((professor) => professor._id);
  log(`Se eliminan ${professors.length} profesores demo y sus clases`);
  if (DRY_RUN) return;

  const classes = await DanceClassModel.find({ organizationId, professorIds: { $in: professorIds } });
  // Only classes taught exclusively by demo professors.
  const demoClassIds = classes
    .filter((item) => item.professorIds.every((id) => professorIds.some((demo) => demo.equals(id))))
    .map((item) => item._id);
  await DanceClassModel.deleteMany({ _id: { $in: demoClassIds } });

  for (const professor of professors) {
    await deleteProfessorMedia(String(organizationId), professor.id, "avatar").catch(() => undefined);
  }
  await ProfessorModel.deleteMany({ _id: { $in: professorIds } });
  await UserModel.deleteMany({ _id: { $in: users.map((user) => user._id) } });

  // Rhythms created by the seed (not the pre-existing ones, which are only unpublished).
  for (const seed of RHYTHMS) {
    const item = await CatalogItemModel.findOne({ organizationId, type: "DISCIPLINE", normalizedName: normalize(seed.name) });
    if (!item) continue;
    const stillUsed = await DanceClassModel.exists({ organizationId, disciplineIds: item._id });
    if (stillUsed) continue;
    await deleteRhythmImage(String(organizationId), item.id).catch(() => undefined);
    if (["pop dance", "fitdance", "stretching"].includes(item.normalizedName)) {
      await CatalogItemModel.deleteOne({ _id: item._id });
    } else {
      item.publishOnWeb = false;
      item.image = undefined;
      item.isActive = false;
      await item.save();
    }
  }
  log("Listo. Los niveles nuevos (Jr., Principiante, Entrenamiento, Intensivo) quedan en el catálogo.");
}

async function main() {
  if (!DRY_RUN && !CONFIRMED) {
    throw new Error("Agregá --dry-run para ver el plan o --yes para aplicar.");
  }

  await connectDatabase();
  const { host, name } = mongoose.connection;
  console.log(`Base: ${host}/${name}`);

  // Fail early if photos cannot be uploaded.
  await getCloudinary().api.ping();

  await (REMOVE ? remove() : apply());
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error(`\nError: ${error instanceof Error ? error.message : error}`);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
