import { expect, test } from "@playwright/test";
import { API, activateTablet, issueTabletCode } from "./tablet";

test("a person without QR registers by DNI and administrative arrivals preserve the method and identity", async ({ page, request }) => {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  expect((await page.request.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } })).ok()).toBe(true);
  expect((await request.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } })).ok()).toBe(true);
  await page.goto("/admin/contacts");
  await page.getByRole("button", { name: "Agregar contacto", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Mara");
  await page.getByLabel("Apellido", { exact: true }).fill("Documento");
  await page.getByLabel("Teléfono", { exact: true }).fill("2215554321");
  await page.getByLabel("DNI", { exact: true }).fill("32.456.789");
  await page.getByRole("button", { name: "Guardar contacto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mara Documento", exact: true })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  expect((await page.request.post(`${API}/api/admin/contacts/${id}/convert`, { data: {} })).ok()).toBe(true);
  const detail = await (await page.request.get(`${API}/api/admin/contacts/${id}`)).json();
  expect(detail.contact.dni).toBe("32456789"); expect(detail.student.dni).toBe("32456789");
  expect((await (await page.request.get(`${API}/api/admin/check-in/contacts/${id}/credential`)).json()).active).toBe(false);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const sessions = await (await page.request.get(`${API}/api/admin/sessions?date=${today}`)).json();
  const classId = sessions.items.find((item: { class: { name: string } }) => item.class.name === "Salsa inicial")?.class.id;
  expect(classId).toBeTruthy();
  expect((await page.request.post(`${API}/api/admin/enrollments`, { data: { classId, studentId: id, billingPreference: "PER_CLASS" } })).status()).toBe(201);
  await page.setViewportSize({ width: 390, height: 844 });
  const issued = await issueTabletCode(request);
  await activateTablet(page, issued.activationCode);
  await expect(page.locator("body")).not.toContainText(/kios[ck]o/i);
  await expect(page.locator('img[src*="hero-couple-smoke"]')).toHaveCount(0);
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await expect(page.getByRole("button", { name: "Escanear QR", exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
    const methods = await page.getByRole("button", { name: "Escanear QR", exact: true }).locator("..").boundingBox();
    expect(Math.abs(methods!.x + methods!.width / 2 - size.width / 2)).toBeLessThanOrEqual(2);
    for (const label of ["Escanear QR", "Usar DNI"]) {
      const bounds = await page.getByRole("button", { name: label, exact: true }).boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(60);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
    }
    await page.screenshot({ path: `../../artifacts/attendance-ready-${size.width}.png`, fullPage: true, animations: "disabled" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Usar DNI", exact: true }).click();
  await expect(page.getByLabel("DNI", { exact: true })).toHaveValue("");
  await page.screenshot({ path: "../../artifacts/attendance-dni-mobile.png", fullPage: true, animations: "disabled" });
  await page.getByLabel("DNI", { exact: true }).fill("32.456.789");
  await page.getByRole("button", { name: "Registrar asistencia", exact: true }).click();
  await expect(page.getByRole("heading", { name: "¡Bienvenida/o, Mara!" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("32456789");
  const arrivals = await (await request.get(`${API}/api/admin/check-in/reception`)).json();
  expect(arrivals.arrivals.filter((item: { studentId: string }) => item.studentId === id)).toHaveLength(1);
  expect(arrivals.arrivals.find((item: { studentId: string }) => item.studentId === id).checkInMethod).toBe("DNI");
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await page.getByRole("button", { name: "Usar DNI", exact: true }).click();
  await expect(page.getByLabel("DNI", { exact: true })).toHaveValue("");
  await page.getByLabel("DNI", { exact: true }).fill("32456789");
  await page.getByRole("button", { name: "Registrar asistencia", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ya te registramos" })).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Volver al inicio", exact: true }).click();
  await page.getByRole("button", { name: "Usar DNI", exact: true }).click();
  await page.getByLabel("DNI", { exact: true }).fill("32456789");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByRole("button", { name: "Usar DNI", exact: true }).click();
  await expect(page.getByLabel("DNI", { exact: true })).toHaveValue("");
});
