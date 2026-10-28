import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4100";

export async function loginAdmin(admin: APIRequestContext) {
  expect((await (await admin.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  expect((await admin.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } })).ok()).toBe(true);
  return admin;
}

export async function issueTabletCode(admin: APIRequestContext, branchId?: string) {
  const branches = await (await admin.get(`${API}/api/admin/branches`)).json() as Array<{ _id: string }>;
  const selected = branchId ?? branches[0]?._id;
  expect(selected).toBeTruthy();
  const response = await admin.post(`${API}/api/admin/check-in/access-code`, { data: { branchId: selected } });
  expect(response.status()).toBe(201);
  return await response.json() as { activationCode: string; branchId: string; deviceId: string };
}

export async function activateTablet(page: Page, code: string) {
  await page.goto("/asistencia");
  await expect(page.getByRole("heading", { name: "Activá esta tablet" })).toBeVisible();
  await page.getByLabel("Código de acceso").fill(code);
  await page.getByRole("button", { name: "Activar registro" }).click();
  await expect(page.getByRole("button", { name: "Escanear QR" })).toBeVisible();
}
