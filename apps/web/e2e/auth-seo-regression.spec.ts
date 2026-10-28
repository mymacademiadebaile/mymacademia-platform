import { expect, test } from "@playwright/test";
const API = process.env.E2E_API_URL ?? "http://localhost:4000";

test("login, session refresh and private navigation still work after the SEO change", async ({ page }) => {
  const marker = await page.request.get(`${API}/__test/isolated`);
  expect((await marker.json()).isolated, "Only use the ephemeral local fixture").toBe(true);
  // Keep analytics and media requests local to this verification.
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/login?next=%2Fadmin%2Fcontacts");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await page.getByLabel("Email o usuario").fill("admin@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("LocalDemoOnly-1234");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/contacts$/);
  await expect(page.getByRole("heading", { name: "Contactos", exact: true })).toBeVisible();

  const cookies = await page.context().cookies();
  for (const name of ["mym_access", "mym_refresh"]) {
    expect(cookies.find((cookie) => cookie.name === name)?.httpOnly).toBe(true);
  }
  await page.context().clearCookies({ name: "mym_access" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Contactos", exact: true })).toBeVisible();
  expect((await page.context().cookies()).some((cookie) => cookie.name === "mym_access")).toBe(true);
  expect((await page.request.get(`${API}/api/admin/students`)).status()).toBe(200);
  expect((await page.request.get(`${API}/api/health`)).status()).toBe(200);
  expect((await page.request.get(`${API}/api/seo-unknown-route`)).status()).toBe(404);

  await page.request.post(`${API}/api/auth/logout`);
  await page.goto("/admin/contacts");
  await expect(page).toHaveURL(/\/login\?next=/);
});
