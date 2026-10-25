import { expect, test } from "@playwright/test";
const API = process.env.E2E_API_URL ?? "http://localhost:4000";

test("a person without QR registers by DNI and administrative arrivals preserve the method and identity", async ({ page }) => {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  expect((await page.request.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } })).ok()).toBe(true);
  await page.goto("/admin/contacts");
  await page.getByRole("button", { name: "Crear contacto", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Mara");
  await page.getByLabel("Apellido", { exact: true }).fill("Documento");
  await page.getByLabel("DNI (opcional)", { exact: true }).fill("32.456.789");
  await page.getByRole("combobox", { name: "Sede", exact: true }).selectOption({ label: "Sede Centro" });
  await page.getByRole("button", { name: "Guardar contacto", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mara Documento", exact: true })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const classes = await (await page.request.get(`${API}/api/admin/classes`)).json();
  expect((await page.request.post(`${API}/api/admin/contacts/${id}/convert`, { data: { classId: classes[0]._id } })).ok()).toBe(true);
  const detail = await (await page.request.get(`${API}/api/admin/contacts/${id}`)).json();
  expect(detail.contact.dni).toBe("32456789"); expect(detail.student.dni).toBe("32456789");
  expect((await (await page.request.get(`${API}/api/admin/check-in/contacts/${id}/credential`)).json()).active).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/asistencia");
  await expect(page.locator("body")).not.toContainText(/kios[ck]o/i);
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(size);
    await expect(page.getByRole("button", { name: "Escanear QR", exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
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
  const arrivals = await (await page.request.get(`${API}/api/admin/check-in/reception`)).json();
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
