import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { env } from "../../config/env";
import { UserModel } from "../auth/user.model";
import { CatalogItemModel } from "../catalogs/catalog.model";
import { DanceClassModel } from "../classes/class.model";
import { BranchModel } from "../core/branch.model";
import { OrganizationModel } from "../core/organization.model";
import { ProfessorModel } from "../professors/professor.model";
import { resetPublicCatalogCache } from "./public.routes";

let mongod: MongoMemoryServer;
const app = createApp();
const ids = {} as Record<string, Types.ObjectId>;
let adminToken: string;

const IMAGE = { url: "https://res.cloudinary.com/demo/image/upload/cover.jpg", width: 800, height: 1200 };
const AVATAR = "https://res.cloudinary.com/demo/image/upload/avatar.jpg";

const adminPatch = (path: string, body: object) =>
  request(app).patch(`/api/admin${path}`).set("Authorization", `Bearer ${adminToken}`).send(body);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    OrganizationModel.init(),
    CatalogItemModel.init(),
    ProfessorModel.init(),
    DanceClassModel.init()
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all(
    [OrganizationModel, BranchModel, CatalogItemModel, ProfessorModel, DanceClassModel, UserModel].map((model) =>
      model.deleteMany({})
    )
  );
  resetPublicCatalogCache();

  const org = await OrganizationModel.create({ name: "M&M", slug: env.PUBLIC_ORGANIZATION_SLUG });
  const branch = await BranchModel.create({ organizationId: org._id, name: "Sede" });
  ids.org = org._id;
  ids.branch = branch._id;

  const [sensual, hidden, level] = await CatalogItemModel.create([
    {
      organizationId: org._id,
      type: "DISCIPLINE",
      name: "Bachata Sensual",
      normalizedName: "bachata sensual",
      slug: "bachata-sensual",
      tagline: "Conexión y musicalidad.",
      image: IMAGE,
      publishOnWeb: true
    },
    {
      organizationId: org._id,
      type: "DISCIPLINE",
      name: "Salsa",
      normalizedName: "salsa",
      tagline: "Sin publicar.",
      image: IMAGE
    },
    { organizationId: org._id, type: "LEVEL", name: "Inicial", normalizedName: "inicial" }
  ]);
  ids.sensual = sensual._id;
  ids.hidden = hidden._id;
  ids.level = level._id;

  const user = await UserModel.create({
    organizationId: org._id,
    branchIds: [branch._id],
    email: "ana.interno@example.com",
    passwordHash: "x",
    firstName: "Ana",
    lastName: "Perez",
    role: "PROFESSOR"
  });
  const professor = await ProfessorModel.create({
    organizationId: org._id,
    userId: user._id,
    displayName: "Ana Pérez",
    phone: "+54 9 221 123-4567",
    slug: "ana-perez",
    bioShort: "Bailarina.",
    avatarUrl: AVATAR,
    publishOnWeb: true
  });
  ids.professor = professor._id;

  await DanceClassModel.create({
    organizationId: org._id,
    branchId: branch._id,
    name: "Sensual inicial",
    professorIds: [professor._id],
    disciplineIds: [sensual._id],
    levelIds: [level._id],
    capacity: 20,
    pricePerClass: 7777,
    schedules: [{ day: "MONDAY", startTime: "19:00", endTime: "20:00" }]
  });

  adminToken = jwt.sign(
    { sub: String(new Types.ObjectId()), organizationId: String(org._id), role: "ADMIN" },
    env.JWT_ACCESS_SECRET
  );
});

describe("GET /api/public/*", () => {
  it("serves the published catalog without authentication", async () => {
    const response = await request(app).get("/api/public/catalog");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=60");
    expect(response.body.styles.map((style: { slug: string }) => style.slug)).toEqual(["bachata-sensual"]);
    expect(response.body.professors[0]).toMatchObject({ slug: "ana-perez", disciplines: ["bachata-sensual"] });
    expect(response.body.schedule[0]).toMatchObject({
      day: "MONDAY",
      className: "Sensual inicial",
      levels: ["Inicial"],
      style: { slug: "bachata-sensual" }
    });
  });

  it("never leaks internal data", async () => {
    const body = JSON.stringify((await request(app).get("/api/public/catalog")).body);

    for (const secret of ["123-4567", "ana.interno", "7777", "capacity", "userId", "organizationId", "Salsa"]) {
      expect(body).not.toContain(secret);
    }
  });

  it("exposes each slice on its own route", async () => {
    const [styles, professors, schedule] = await Promise.all([
      request(app).get("/api/public/styles"),
      request(app).get("/api/public/professors"),
      request(app).get("/api/public/schedule")
    ]);

    expect(styles.body).toHaveLength(1);
    expect(professors.body).toHaveLength(1);
    expect(schedule.body).toHaveLength(1);
  });

  it("only exposes configured social profile URLs", async () => {
    await OrganizationModel.updateOne(
      { _id: ids.org },
      {
        $set: {
          instagramUrl: "https://www.instagram.com/mym.academia",
          tiktokUrl: "https://www.tiktok.com/@mym.academia",
          facebookUrl: "https://www.facebook.com/mymacademia",
          youtubeUrl: "https://www.youtube.com/@mymacademia"
        }
      }
    );
    resetPublicCatalogCache();

    const response = await request(app).get("/api/public/social-links");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      instagram: "https://www.instagram.com/mym.academia",
      tiktok: "https://www.tiktok.com/@mym.academia",
      facebook: "https://www.facebook.com/mymacademia",
      youtube: "https://www.youtube.com/@mymacademia"
    });
  });

  it("omits social links that have not been configured", async () => {
    const response = await request(app).get("/api/public/social-links");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });

  it("drops a rhythm as soon as it is deactivated", async () => {
    await CatalogItemModel.updateOne({ _id: ids.sensual }, { isActive: false });
    resetPublicCatalogCache();

    const response = await request(app).get("/api/public/catalog");
    expect(response.body.styles).toEqual([]);
    expect(response.body.schedule).toEqual([]);
  });
});

describe("admin publishing rules", () => {
  it("publishes a complete rhythm and generates its slug", async () => {
    await CatalogItemModel.updateOne({ _id: ids.hidden }, { slug: undefined });

    const response = await adminPatch(`/catalogs/${ids.hidden}`, { publishOnWeb: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ publishOnWeb: true, slug: "salsa" });
  });

  it("refuses to publish a rhythm without image or short description", async () => {
    await CatalogItemModel.updateOne({ _id: ids.hidden }, { $unset: { image: 1, tagline: 1 } });

    const response = await adminPatch(`/catalogs/${ids.hidden}`, { publishOnWeb: true });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("RHYTHM_NOT_PUBLISHABLE");
    expect(response.body.message).toContain("falta la imagen");
  });

  it("keeps web fields off levels and segments", async () => {
    const response = await adminPatch(`/catalogs/${ids.level}`, { tagline: "No aplica" });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("CATALOG_WEB_FIELDS_NOT_ALLOWED");
  });

  it("does not allow two rhythms with the same public URL", async () => {
    const response = await adminPatch(`/catalogs/${ids.hidden}`, { slug: "Bachata Sensual" });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("SLUG_ALREADY_EXISTS");
  });

  it("refuses to publish a professor without photo or short description", async () => {
    await ProfessorModel.updateOne({ _id: ids.professor }, { $unset: { avatarUrl: 1 }, publishOnWeb: false });

    const response = await adminPatch(`/professors/${ids.professor}`, { publishOnWeb: true });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("PROFESSOR_NOT_PUBLISHABLE");
  });

  it("saves the short and the full bio and generates the professor slug", async () => {
    await ProfessorModel.updateOne({ _id: ids.professor }, { $unset: { slug: 1 }, publishOnWeb: false });

    const response = await adminPatch(`/professors/${ids.professor}`, {
      bioShort: "Bailarina y docente.",
      bio: "Bio larga.\n\nSegundo párrafo.",
      publishOnWeb: true
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ slug: "ana-perez", bioShort: "Bailarina y docente.", publishOnWeb: true });
  });

  it("lets the admin hide a single class", async () => {
    const danceClass = await DanceClassModel.findOne({ organizationId: ids.org });

    const response = await adminPatch(`/classes/${danceClass!.id}`, { publishOnWeb: false });
    expect(response.status).toBe(200);

    resetPublicCatalogCache();
    const catalog = await request(app).get("/api/public/catalog");
    expect(catalog.body.schedule).toEqual([]);
  });
});
