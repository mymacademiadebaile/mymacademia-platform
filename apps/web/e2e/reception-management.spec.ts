import { expect, test } from "@playwright/test";
const API = process.env.E2E_API_URL ?? "http://localhost:4000";

test("admin generates a printable QR, authorizes a device and previews reminders with automatic delivery off", async ({ page }) => {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  await page.request.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } });
  const contact = (await (await page.request.get(`${API}/api/admin/contacts?q=Lucía`)).json()).items[0];
  const account = await (await page.request.get(`${API}/api/admin/debt-reminders/students/${contact._id}/preview`)).json();
  if (account.balance.pendingCents === 0) await page.request.post(`${API}/api/admin/billing/charges`, { data: {
    studentId: contact._id, kind: "OTHER", period: "2026-10", concept: "Clase de verificación", amount: 5000, dueDate: "2026-10-23"
  } });
  await page.goto(`/admin/contacts/${contact._id}`);
  const generate = page.getByRole("button", { name: /^(Generar|Renovar) QR$/ });
  await expect(generate).toBeEnabled();
  const renewing = await generate.textContent(); await generate.click();
  if (renewing?.includes("Renovar")) await page.getByRole("button", { name: "Renovar", exact: true }).click();
  await expect(page.getByRole("img", { name: "QR personal de Lucía Pérez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar QR" })).toHaveAttribute("href", /^data:image\/png/);
  await page.goto("/admin/reception");
  await page.getByRole("button", { name: "Dispositivos", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Tablet adicional");
  await page.getByRole("combobox", { name: "Sede", exact: true }).selectOption({ label: "Sede Centro" });
  await page.getByRole("button", { name: "Autorizar nuevo dispositivo" }).click();
  await expect(page.getByLabel("Código de activación generado")).toHaveValue(/^[A-Za-z0-9_-]{43}$/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../../artifacts/reception-desktop.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Ocultar código", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../../artifacts/reception-mobile.png", fullPage: true, animations: "disabled" });
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  await page.request.patch(`${API}/api/admin/contacts/${contact._id}`, { data: { email: "lucia@example.test" } });
  await page.goto(`/admin/reminders?studentId=${contact._id}`);
  await expect(page.getByLabel("Habilitar envío programado")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Enviar recordatorio", exact: true })).toBeDisabled();
  await page.getByLabel("Habilitar recordatorios por email").check();
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByRole("status")).toHaveText("Configuración guardada");
  await expect(page.getByLabel("Vista previa del mensaje")).toHaveValue(/Saldo pendiente:/);
  await expect(page.getByLabel("Habilitar envío programado")).not.toBeChecked();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../../artifacts/reminders-desktop.png", fullPage: true, animations: "disabled" });
  // The fixture points SMTP at localhost:1; this exercises failure/history without sending real mail.
  await page.getByRole("button", { name: "Enviar recordatorio", exact: true }).click();
  await page.getByRole("button", { name: "Enviar email", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No pudimos confirmar el envío" })).toBeVisible();
  await expect(page.getByText("Envío no confirmado", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "../../artifacts/reminders-mobile.png", fullPage: true, animations: "disabled" });
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
});
