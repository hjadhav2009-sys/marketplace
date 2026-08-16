import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c4");
const stagingRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const credentialsPath = path.join(stagingRoot, "credentials", "synthetic-users.json");
const environmentPath = path.join(stagingRoot, "runtime", "environment.json");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");

await mkdir(output, { recursive: true });
const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
const environment = JSON.parse(await readFile(environmentPath, "utf8"));
const buildId = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C4 browser QA requires the private synthetic database.");
const db = new PrismaClient({ datasourceUrl: `file:${String(environment.databasePath).replace(/\\/g, "/")}` });
const credential = (scenario) => {
  const item = credentials.users.find((entry) => entry.scenario === scenario);
  if (!item) throw new Error(`Missing synthetic ${scenario} credential.`);
  return item;
};

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function session(browser, viewport, scenario) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.route(/https:\/\/(invalid\.example\.invalid|example\.invalid)\//, (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-image" }));
  const page = await context.newPage();
  const errors = monitor(page);
  const user = credential(scenario);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(user.username);
  await page.locator('input[name="password"]').fill(user.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }), page.locator("form").first().evaluate((form) => form.requestSubmit())]);
  if (new URL(page.url()).pathname === "/accounts") await chooseAccount(page, "stage3-account-fk-01");
  return { context, page, errors };
}

async function chooseAccount(page, accountId) {
  if (new URL(page.url()).pathname !== "/accounts") await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
  await Promise.all([page.waitForURL((url) => url.pathname !== "/accounts", { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]);
}

async function navigateViaAssemblyLink(page, width) {
  if (width < 1280) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await Promise.all([page.waitForURL((url) => url.pathname === "/work/assemble"), nav.getByRole("link", { name: "Assembly", exact: true }).click()]);
  } else {
    await Promise.all([page.waitForURL((url) => url.pathname === "/work/assemble"), page.getByRole("link", { name: "Assembly", exact: true }).click()]);
  }
  await page.getByRole("heading", { level: 1, name: "Assembly" }).waitFor();
}

async function inspect(page, width) {
  let currentPages;
  if (width < 1280) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await nav.waitFor();
    currentPages = await nav.locator('[aria-current="page"]').count();
    await page.getByRole("button", { name: "Close navigation" }).click();
    await nav.waitFor({ state: "detached" });
  } else {
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.locator('[aria-current="page"]').waitFor();
    currentPages = await nav.locator('[aria-current="page"]').count();
  }
  const inspection = await page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled; };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44),
      text: document.body.innerText,
    };
  });
  return { ...inspection, currentPages };
}

const errorsHealthy = (errors) => Object.values(errors).every((items) => items.length === 0);
const healthy = (inspection, errors) => inspection.clientWidth === inspection.scrollWidth && inspection.undersized.length === 0 && inspection.currentPages === 1 && errorsHealthy(errors);
const viewports = [
  { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 },
];
const id = (viewport) => `${viewport.width}x${viewport.height}`;
const results = [];

async function verifyOverlays(page) {
  const card = page.locator("[data-responsive-work-card]", { hasText: "Synthetic C4 ready Customer Order Assembly" }).first();
  await card.getByRole("button", { name: "Partial Quantity" }).click();
  const partial = page.locator('[data-worker-overlay="PARTIAL_QUANTITY"] [role="dialog"]');
  await partial.waitFor();
  const partialFocus = await page.evaluate(() => document.activeElement?.getAttribute("data-worker-overlay-title") !== null);
  const partialBounds = await partial.boundingBox();
  await page.keyboard.press("Escape");
  const partialReturned = await card.getByRole("button", { name: "Partial Quantity" }).evaluate((element) => document.activeElement === element);
  await card.getByRole("button", { name: "Details" }).click();
  const details = page.locator('[data-worker-overlay="DETAILS"] [role="dialog"]');
  await details.waitFor();
  const detailsText = await details.innerText();
  await page.keyboard.press("Escape");
  const imageButton = card.getByRole("button", { name: /Open large image preview/ }).first();
  await imageButton.click();
  const image = page.locator('[data-worker-overlay="IMAGE"] [role="dialog"]');
  await image.waitFor();
  const imageText = await image.innerText();
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "Assembly Completed" }).focus();
  const focus = await card.getByRole("button", { name: "Assembly Completed" }).evaluate((element) => { const style = getComputedStyle(element); return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor }; });
  return { partialFocus, partialReturned, partialBounds, detailsText, imageText, focus };
}

async function clickCompletion(page, source, title) {
  await page.goto(`${base}/work/assemble?source=${source}`, { waitUntil: "domcontentloaded" });
  const card = page.locator("[data-responsive-work-card]", { hasText: title }).first();
  await card.waitFor();
  await Promise.all([page.waitForURL((url) => url.pathname === "/work/assemble" && url.searchParams.has("success"), { timeout: 20_000 }), card.getByRole("button", { name: "Assembly Completed" }).click()]);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
try {
  for (const viewport of viewports) {
    const assembler = await session(browser, viewport, "ASSEMBLER");
    await navigateViaAssemblyLink(assembler.page, viewport.width);
    const landingText = await assembler.page.locator("body").innerText();
    const landingInspection = await inspect(assembler.page, viewport.width);
    results.push({ state: "CANONICAL_NAVIGATION_AND_SOURCE_CHOICE", viewport: id(viewport), pass: new URL(assembler.page.url()).pathname === "/work/assemble" && landingText.includes("Customer Orders") && landingText.includes("Consignments") && landingText.includes("Review the product and Assembly instructions") && healthy(landingInspection, assembler.errors), inspection: landingInspection, errors: structuredClone(assembler.errors) });

    await assembler.page.goto(`${base}/work/assemble?source=ORDER`, { waitUntil: "domcontentloaded" });
    const orderInspection = await inspect(assembler.page, viewport.width);
    results.push({ state: "ORDER_ASSEMBLY_WORKSPACE", viewport: id(viewport), pass: orderInspection.text.includes("Synthetic C4 ready Customer Order Assembly") && orderInspection.text.includes("Synthetic C4 progress Customer Order Assembly") && orderInspection.text.includes("Manual Assembly guidance") && orderInspection.text.includes("Assembly instructions unavailable") && orderInspection.text.includes("Partial Quantity") && healthy(orderInspection, assembler.errors), inspection: orderInspection, errors: structuredClone(assembler.errors) });

    await assembler.page.goto(`${base}/work/assemble?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
    const consignmentInspection = await inspect(assembler.page, viewport.width);
    results.push({ state: "CONSIGNMENT_ASSEMBLY_WORKSPACE", viewport: id(viewport), pass: consignmentInspection.text.includes("STAGE-C4-CONSIGNMENT-READY") && consignmentInspection.text.includes("STAGE-C4-CONSIGNMENT-PROGRESS") && consignmentInspection.text.includes("Manual route instructions") && consignmentInspection.text.includes("Assembly instructions unavailable") && consignmentInspection.text.includes("Work paused") && healthy(consignmentInspection, assembler.errors), inspection: consignmentInspection, errors: structuredClone(assembler.errors) });

    if (viewport.width === 390) {
      await assembler.page.goto(`${base}/work/assemble?source=ORDER`, { waitUntil: "domcontentloaded" });
      const overlays = await verifyOverlays(assembler.page);
      const detailsText = overlays.detailsText.toLowerCase();
      results.push({ state: "PARTIAL_DETAILS_IMAGE_FOCUS", viewport: id(viewport), pass: overlays.partialFocus && overlays.partialReturned && overlays.partialBounds?.height <= viewport.height * 0.91 && detailsText.includes("assembly guidance") && detailsText.includes("recent stage history") && overlays.imageText.toLowerCase().includes("product image") && overlays.focus.outlineStyle === "solid" && parseFloat(overlays.focus.outlineWidth) >= 3, overlays });
      await assembler.page.goto(`${base}/work/assemble?source=ORDER&status=problem`, { waitUntil: "domcontentloaded" });
      const problemText = await assembler.page.locator("body").innerText();
      await assembler.page.goto(`${base}/work/assemble?source=ORDER&status=completed`, { waitUntil: "domcontentloaded" });
      const completedText = await assembler.page.locator("body").innerText();
      results.push({ state: "ORDER_PROBLEM_AND_COMPLETED_RECEIPTS", viewport: id(viewport), pass: problemText.includes("Synthetic C4 problem Customer Order Assembly") && problemText.includes("Open Problem") && completedText.includes("Synthetic C4 completed Customer Order Assembly") && completedText.includes("read-only receipt") });
    }
    if (viewport.width === 390 || viewport.width === 1440) await assembler.page.screenshot({ path: path.join(output, `assembly-${id(viewport)}.png`), fullPage: true });
    await assembler.context.close();
  }

  const readOnly = await session(browser, { width: 390, height: 844 }, "VIEW_ALL");
  await readOnly.page.goto(`${base}/work/assemble?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
  const readOnlyText = await readOnly.page.locator("body").innerText();
  results.push({ state: "READ_ONLY_ASSEMBLY", viewport: "390x844", pass: readOnlyText.includes("Read-only work view") && !readOnlyText.includes("Assembly Completed") && errorsHealthy(readOnly.errors), errors: readOnly.errors });
  await readOnly.context.close();

  const owner = await session(browser, { width: 390, height: 844 }, "OWNER");
  await chooseAccount(owner.page, "stage3-account-fk-02");
  await owner.page.goto(`${base}/work/assemble`, { waitUntil: "domcontentloaded" });
  const emptyText = await owner.page.locator("body").innerText();
  await chooseAccount(owner.page, "stage4-account-pick-projection");
  await owner.page.goto(`${base}/work/assemble`, { waitUntil: "domcontentloaded" });
  const projectionText = await owner.page.locator("body").innerText();
  results.push({ state: "EMPTY_AND_PROJECTION_UNAVAILABLE", viewport: "390x844", pass: emptyText.includes("No active Assembly work") && projectionText.includes("Assembly queue temporarily unavailable") && projectionText.includes("Worker actions are unavailable") && errorsHealthy(owner.errors), errors: owner.errors });
  await owner.context.close();

  const mutations = await session(browser, { width: 390, height: 844 }, "ASSEMBLER");
  await mutations.page.goto(`${base}/work/assembly`, { waitUntil: "domcontentloaded" });
  await mutations.page.waitForURL((url) => url.pathname === "/work/assemble" && url.searchParams.get("source") === "ORDER");
  results.push({ state: "LEGACY_DEFAULT_REDIRECT", viewport: "390x844", pass: new URL(mutations.page.url()).pathname === "/work/assemble" && new URL(mutations.page.url()).searchParams.get("source") === "ORDER" });

  await clickCompletion(mutations.page, "ORDER", "Synthetic C4 ready Customer Order Assembly");
  const orderTasks = await db.workTask.findMany({ where: { orderId: "stage4-c4-order-ready" }, orderBy: { sequenceNumber: "asc" } });
  const orderAssembly = orderTasks.find((task) => task.stage === "ASSEMBLE");
  const orderPack = orderTasks.find((task) => task.stage === "PACK");
  const orderRoute = JSON.parse(orderAssembly?.routeSnapshotJson ?? "{}");
  results.push({ state: "ORDER_ASSEMBLY_COMPLETION_MUTATION", viewport: "390x844", pass: orderAssembly?.status === "COMPLETED" && orderAssembly.completedQuantity === 6 && orderPack?.status === "READY" && orderTasks.filter((task) => task.stage === "PACK").length === 1 && orderRoute.currentStage === "PACK" && orderRoute.completedStages.includes("ASSEMBLE") && await db.workActionLog.count({ where: { taskId: orderAssembly?.id, action: "TASK_COMPLETED" } }) === 1 && errorsHealthy(mutations.errors), truth: { assembly: orderAssembly?.status, quantity: orderAssembly?.completedQuantity, pack: orderPack?.status, route: orderRoute } });

  await clickCompletion(mutations.page, "CONSIGNMENT", "STAGE-C4-CONSIGNMENT-READY");
  const consignmentTasks = await db.workTask.findMany({ where: { consignmentLineId: "stage4-c4-line-ready" }, orderBy: { sequenceNumber: "asc" } });
  const consignmentAssembly = consignmentTasks.find((task) => task.stage === "ASSEMBLE");
  const consignmentPack = consignmentTasks.find((task) => task.stage === "PACK");
  const consignmentRoute = JSON.parse(consignmentAssembly?.routeSnapshotJson ?? "{}");
  results.push({ state: "CONSIGNMENT_ASSEMBLY_COMPLETION_MUTATION", viewport: "390x844", pass: consignmentAssembly?.status === "COMPLETED" && consignmentAssembly.completedQuantity === 6 && consignmentPack?.status === "READY" && !consignmentTasks.some((task) => task.stage === "MARK") && consignmentRoute.currentStage === "PACK" && JSON.stringify(consignmentRoute.actualStages) === JSON.stringify(["PICK", "ASSEMBLE", "PACK"]) && JSON.stringify(consignmentRoute.completedStages) === JSON.stringify(["PICK", "ASSEMBLE"]) && await db.workActionLog.count({ where: { taskId: consignmentAssembly?.id, action: "TASK_COMPLETED" } }) === 1, truth: { assembly: consignmentAssembly?.status, quantity: consignmentAssembly?.completedQuantity, pack: consignmentPack?.status, route: consignmentRoute } });

  await mutations.page.goto(`${base}/work/assemble?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
  const partialCard = mutations.page.locator("[data-responsive-work-card]", { hasText: "STAGE-C4-CONSIGNMENT-PROGRESS" }).first();
  await partialCard.getByRole("button", { name: "Partial Quantity" }).click();
  const partialDialog = mutations.page.locator('[data-worker-overlay="PARTIAL_QUANTITY"] [role="dialog"]');
  await partialDialog.locator('input[name="targetQuantity"]').fill("4");
  await Promise.all([mutations.page.waitForURL((url) => url.pathname === "/work/assemble" && url.searchParams.has("success")), partialDialog.getByRole("button", { name: "Save partial quantity" }).click()]);
  const partialAssembly = await db.workTask.findUniqueOrThrow({ where: { id: "stage4-c4-line-progress-assemble" } });
  const partialPack = await db.workTask.findUniqueOrThrow({ where: { id: "stage4-c4-line-progress-pack" } });
  results.push({ state: "VALID_PARTIAL_REMAINS_ASSEMBLY", viewport: "390x844", pass: partialAssembly.status === "IN_PROGRESS" && partialAssembly.completedQuantity === 4 && partialPack.status === "LOCKED" && errorsHealthy(mutations.errors), truth: { assembly: partialAssembly.status, quantity: partialAssembly.completedQuantity, pack: partialPack.status }, errors: mutations.errors });
  await mutations.context.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C4AssemblyBrowserV1", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", sourceSha: environment.sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), buildId: environment.buildId }, null, 2));
if (failures.length) process.exitCode = 1;
