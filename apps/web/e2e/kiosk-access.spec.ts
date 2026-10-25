import { expect, test, type Page } from "@playwright/test";
const API = process.env.E2E_API_URL ?? "http://localhost:4000";

async function login(page: Page) {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  expect((await page.request.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } })).ok()).toBe(true);
}

test("SUPER_ADMIN lands in administration and opens the kiosk with the same login", async ({ page }) => {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  await page.goto("/login");
  await page.getByLabel("Email o usuario", { exact: true }).fill("superadmin@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("LocalDemoOnly-1234");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/check-in");
  await expect(page.getByRole("button", { name: "Habilitar cámara y sonido" })).toBeVisible();
  expect((await page.request.get(`${API}/api/auth/me`)).ok()).toBe(true);
});

test("an expired access cookie renews the admin session and opens the kiosk without another login", async ({ page, context }) => {
  await login(page);
  const cookie = (await context.cookies(API)).find((cookie) => cookie.name === "mym_access")!;
  await context.addCookies([{ ...cookie, value: "expired-access-cookie" }]);
  let refreshes = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/auth/refresh")) refreshes++; });
  await page.goto("/check-in");
  await expect(page.getByRole("button", { name: "Habilitar cámara y sonido" })).toBeVisible();
  expect(refreshes).toBe(1);
  expect((await page.request.get(`${API}/api/auth/me`)).ok()).toBe(true);
  await expect(page.getByRole("link", { name: "Iniciar sesión como administrador" })).toHaveCount(0);
});

test("an origin/server rejection does not send a signed-in admin back to login and can recover", async ({ page }) => {
  await login(page);
  await page.route("**/api/check-in/authorize", (route) => route.fulfill({ status: 403, json: { error: "INVALID_ORIGIN", message: "No se pudo abrir el acceso de recepción." } }));
  let refreshes = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/auth/refresh")) refreshes++; });
  await page.goto("/check-in");
  await expect(page.getByRole("heading", { name: "No pudimos abrir el kiosco" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar sesión como administrador" })).toHaveCount(0);
  expect(refreshes).toBe(0);
  await page.screenshot({ path: "../../artifacts/kiosk-access-error.png", animations: "disabled" });
  await page.unroute("**/api/check-in/authorize");
  await page.getByRole("button", { name: "Volver a intentar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Habilitar cámara y sonido" })).toBeVisible();
});

test("a device-service outage does not reauthorize or claim a login failure", async ({ page }) => {
  await login(page);
  await page.route("**/api/check-in/device", (route) => route.fulfill({ status: 503, json: { error: "DATABASE_UNAVAILABLE", message: "Recepción no está disponible temporalmente." } }));
  let authorizations = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/check-in/authorize")) authorizations++; });
  await page.goto("/check-in");
  await expect(page.getByRole("heading", { name: "No pudimos abrir el kiosco" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar sesión como administrador" })).toHaveCount(0);
  expect(authorizations).toBe(0);
  await page.unroute("**/api/check-in/device");
  await page.getByRole("button", { name: "Volver a intentar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Habilitar cámara y sonido" })).toBeVisible();
});

test("a denied camera permission offers help without recording attendance", async ({ page }) => {
  await login(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => { throw new DOMException("Permission denied", "NotAllowedError"); } });
  });
  let scans = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/check-in/scan")) scans++; });
  await page.goto("/check-in");
  await page.getByRole("button", { name: "Habilitar cámara y sonido" }).click();
  await expect(page.getByRole("heading", { name: "Recepción te ayuda" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "permiso del navegador" })).toBeVisible();
  expect(scans).toBe(0);
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Habilitar cámara y sonido" })).toBeVisible();
});
