import { expect, test } from "@playwright/test";
import { API, activateTablet, issueTabletCode, loginAdmin } from "./tablet";

test("tablet activation is one-time, survives reload and is revoked from the API", async ({ page, request, browser }) => {
  const admin = await loginAdmin(request);
    const issued = await issueTabletCode(admin);
    await page.goto("/asistencia");
    await expect(page.getByRole("heading", { name: "Activá esta tablet" })).toBeVisible();
    await page.getByLabel("Código de acceso").fill("AAAAA-AAAAA");
    await page.getByRole("button", { name: "Activar registro" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "código no es válido" })).toBeVisible();
    await page.getByLabel("Código de acceso").fill(issued.activationCode);
    await page.getByRole("button", { name: "Activar registro" }).click();
    await expect(page.getByRole("button", { name: "Escanear QR" })).toBeVisible();
    expect((await page.request.get(`${API}/api/check-in/device`)).status()).toBe(200);
    expect((await page.request.get(`${API}/api/admin/contacts`)).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole("button", { name: "Escanear QR" })).toBeVisible();
    const secondContext = await browser.newContext();
    try {
      const secondPage = await secondContext.newPage();
      await secondPage.goto("/asistencia");
      await secondPage.getByLabel("Código de acceso").fill(issued.activationCode);
      await secondPage.getByRole("button", { name: "Activar registro" }).click();
      await expect(secondPage.getByRole("alert").filter({ hasText: "código no es válido" })).toBeVisible();
    } finally { await secondContext.close(); }
    expect((await admin.post(`${API}/api/admin/check-in/access-code/revoke`, { data: { branchId: issued.branchId } })).status()).toBe(204);
    expect((await page.request.get(`${API}/api/check-in/device`)).status()).toBe(401);
    expect((await page.request.post(`${API}/api/check-in/scan`, { data: { dni: "99888777" } })).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Activá esta tablet" })).toBeVisible();
});

test("replacing the branch code invalidates the previous tablet", async ({ page, request }) => {
  const admin = await loginAdmin(request);
    const first = await issueTabletCode(admin);
    await activateTablet(page, first.activationCode);
    const replacement = await issueTabletCode(admin, first.branchId);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Activá esta tablet" })).toBeVisible();
    await page.getByLabel("Código de acceso").fill(replacement.activationCode);
    await page.getByRole("button", { name: "Activar registro" }).click();
    await expect(page.getByRole("button", { name: "Escanear QR" })).toBeVisible();
});

test("device-service outage shows recovery without trying an admin login", async ({ page, request }) => {
  const admin = await loginAdmin(request);
    const issued = await issueTabletCode(admin);
    await activateTablet(page, issued.activationCode);
    await page.route("**/api/check-in/device", (route) => route.fulfill({ status: 503, json: { error: "DATABASE_UNAVAILABLE", message: "Recepción no está disponible temporalmente." } }));
    let authorizations = 0;
    page.on("request", (request) => { if (request.url().endsWith("/api/check-in/authorize")) authorizations++; });
    await page.reload();
    await expect(page.getByRole("heading", { name: "No pudimos abrir el registro de asistencia" })).toBeVisible();
    expect(authorizations).toBe(0);
    await page.unroute("**/api/check-in/device");
    await page.getByRole("button", { name: "Volver a intentar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Escanear QR" })).toBeVisible();
});

test("denied camera permission offers help without recording attendance", async ({ page, request }) => {
  const admin = await loginAdmin(request);
    const issued = await issueTabletCode(admin);
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } });
    });
    let scans = 0;
    page.on("request", (request) => { if (request.url().endsWith("/api/check-in/scan")) scans++; });
    await activateTablet(page, issued.activationCode);
    await page.getByRole("button", { name: "Escanear QR" }).click();
    await expect(page.getByRole("heading", { name: "Recepción te ayuda" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "permiso del navegador" })).toBeVisible();
    expect(scans).toBe(0);
    await page.getByRole("button", { name: "Usar DNI", exact: true }).click();
    await expect(page.getByLabel("DNI", { exact: true })).toBeVisible();
});

test("SUPER_ADMIN reaches the administrative panel but the tablet still requires its code", async ({ page }) => {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email o usuario", { exact: true }).fill("superadmin@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("LocalDemoOnly-1234");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/asistencia");
  await expect(page.getByRole("heading", { name: "Activá esta tablet" })).toBeVisible();
});
