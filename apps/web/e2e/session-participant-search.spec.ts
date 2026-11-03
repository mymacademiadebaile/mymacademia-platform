import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://localhost:4000";

test("session modal searches exact student identity fields and adds the selected person", async ({ page }) => {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  expect((await page.request.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } })).ok()).toBe(true);
  const branches = await (await page.request.get(`${API}/api/admin/branches`)).json();
  const branchId = branches[0]._id;
  for (const person of [
    { firstName: "Jorge", lastName: "Dominguez", email: "jorge.search@example.test", phone: "2216689012", dni: "34.123.456" },
    { firstName: "Mariano", lastName: "Ortiz", email: "mariano.search@example.test", phone: "2216689013", dni: "34.123.457" }
  ]) {
    const response = await page.request.post(`${API}/api/admin/students`, { data: { branchId, ...person } });
    expect(response.status()).toBe(201);
  }

  await page.goto("/admin/calendar");
  await page.getByRole("button", { name: /Salsa inicial/ }).first().click();
  await page.getByRole("button", { name: "Agregar solo a esta fecha" }).click();
  const modal = page.locator("form").filter({ has: page.getByRole("heading", { name: "Agregar alumno a esta clase" }) });
  const search = modal.getByLabel("Buscar alumno");
  const add = modal.getByRole("button", { name: "Agregar", exact: true });
  await expect(add).toBeDisabled();

  for (const query of ["jorge", "Jorge Dominguez", "jorge.search@example.test", "221-6689012", "34.123.456"]) {
    await search.fill(query);
    await expect(modal.getByRole("button", { name: /Jorge Dominguez/ })).toBeVisible();
    await expect(modal.getByRole("button", { name: /Mariano Ortiz/ })).toHaveCount(0);
  }

  await page.route("**/api/admin/students?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("q") === "mariano") {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    await route.continue().catch(() => {});
  });
  const oldRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get("q") === "mariano");
  await search.fill("mariano");
  await oldRequest;
  await search.fill("jorge");
  await expect(modal.getByRole("button", { name: /Jorge Dominguez/ })).toBeVisible();
  await page.waitForTimeout(750);
  await expect(modal.getByRole("button", { name: /Mariano Ortiz/ })).toHaveCount(0);
  await modal.getByRole("button", { name: /Jorge Dominguez/ }).click();
  await expect(modal.getByText("Jorge Dominguez")).toBeVisible();
  await expect(modal.getByText("seleccionado")).toBeVisible();
  await expect(add).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../../artifacts/session-participant-selected-mobile.png", fullPage: true, animations: "disabled" });
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
  await add.click();
  await expect(page.getByRole("heading", { name: "Agregar alumno a esta clase" })).toHaveCount(0);
  await expect(page.getByText("Jorge Dominguez", { exact: true })).toBeVisible();
});

test("calendar drawer enrolls in the selected class with monthly billing", async ({ page }) => {
  expect((await (await page.request.get(`${API}/__test/isolated`)).json()).isolated).toBe(true);
  expect((await page.request.post(`${API}/api/auth/login`, { data: { login: "admin@example.test", password: "LocalDemoOnly-1234" } })).ok()).toBe(true);
  const danceClass = (await (await page.request.get(`${API}/api/admin/classes?q=Salsa inicial`)).json())[0];
  const student = await page.request.post(`${API}/api/admin/students`, { data: {
    branchId: danceClass.branchId, firstName: "Alumna", lastName: "Mensual", email: "alumna.mensual@example.test"
  } });
  expect(student.status()).toBe(201);
  const studentId = (await student.json())._id;
  const configured = await page.request.patch(`${API}/api/admin/classes/${danceClass._id}`, { data: {
    billingMode: "BOTH", monthlyPrice4: 18000, monthlyPrice8: 32000
  } });
  expect(configured.ok()).toBe(true);

  try {
    await page.goto("/admin/calendar");
    const detailResponse = page.waitForResponse((response) => /\/api\/admin\/sessions\/[a-f0-9]{24}$/.test(response.url()));
    await page.getByRole("button", { name: /Salsa inicial/ }).first().click();
    const session = await (await detailResponse).json();
    await page.getByRole("button", { name: "Inscribir", exact: true }).click();
    const modal = page.locator("form").filter({ has: page.getByRole("heading", { name: "Inscribir alumno a la clase" }) });
    await expect(modal.getByLabel("Fecha de inicio")).toHaveValue(session.sessionDate);
    await modal.getByLabel("Buscar alumno").fill("Alumna Mensual");
    await modal.getByRole("button", { name: /Alumna Mensual/ }).click();
    await modal.getByLabel("Cómo paga").selectOption("MONTHLY");
    await modal.getByLabel("Plan mensual").selectOption("8");
    if (session.sessionDate.slice(8, 10) !== "01") await modal.getByLabel("Cobro del primer mes").selectOption("FULL");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(true);
    await modal.getByRole("button", { name: "Inscribir alumno" }).click();
    await expect(page.getByRole("heading", { name: "Inscribir alumno a la clase" })).toHaveCount(0);
    const enrollments = await (await page.request.get(`${API}/api/admin/enrollments?classId=${danceClass._id}`)).json();
    const enrollment = enrollments.items.find((item: { studentId: { _id: string } }) => item.studentId._id === studentId);
    expect(enrollment).toMatchObject({ billingPreference: "MONTHLY", monthlyPlan: 8 });
    expect(enrollment.seriesIds).toContain(session.seriesId);
  } finally {
    const enrollments = await (await page.request.get(`${API}/api/admin/enrollments?classId=${danceClass._id}`)).json();
    const enrollment = enrollments.items.find((item: { studentId: { _id: string } }) => item.studentId._id === studentId);
    if (enrollment) await page.request.delete(`${API}/api/admin/enrollments/${enrollment._id}`);
    await page.request.patch(`${API}/api/admin/classes/${danceClass._id}`, { data: {
      billingMode: danceClass.billingMode, monthlyPrice4: danceClass.monthlyPrice4 ?? null, monthlyPrice8: danceClass.monthlyPrice8 ?? null
    } });
  }
});
