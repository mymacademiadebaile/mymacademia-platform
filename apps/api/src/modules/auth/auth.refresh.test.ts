import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { OrganizationModel } from "../core/organization.model";
import { UserModel } from "./user.model";

let mongod: MongoMemoryServer;
const app = createApp();
let email: string;
const password = "correct-horse-battery-staple";

function cookieValue(cookies: string[], name: string) {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return cookie.split(";", 1)[0];
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const organization = await OrganizationModel.create({ name: "Test", slug: "auth-refresh" });
  email = "refresh@example.com";
  await UserModel.create({
    organizationId: organization._id,
    branchIds: [],
    email,
    passwordHash: await bcrypt.hash(password, 4),
    firstName: "Refresh",
    lastName: "Test",
    role: "ADMIN",
    isActive: true
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("authentication refresh", () => {
  it("issues a long-lived refresh cookie and uses it to renew access", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password });

    expect(login.status).toBe(200);
    const loginCookies = login.headers["set-cookie"] as string[];
    const refreshCookie = cookieValue(loginCookies, "mym_refresh");
    expect(loginCookies.some((value) => value.startsWith("mym_access="))).toBe(true);
    expect(refreshCookie).toContain("mym_refresh=");

    const refresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(refresh.status).toBe(204);
    const accessCookie = cookieValue(refresh.headers["set-cookie"] as string[], "mym_access");

    const me = await request(app).get("/api/auth/me").set("Cookie", accessCookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it("does not allow a refresh token to access protected endpoints", async () => {
    const login = await request(app).post("/api/auth/login").send({ email, password });
    const refreshCookie = cookieValue(login.headers["set-cookie"] as string[], "mym_refresh");
    const refreshToken = refreshCookie.slice("mym_refresh=".length);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `mym_access=${refreshToken}`);

    expect(me.status).toBe(401);
    expect(me.body.error).toBe("INVALID_TOKEN");
  });
});
