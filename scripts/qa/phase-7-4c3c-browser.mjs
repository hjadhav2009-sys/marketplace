import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c3c");
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
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C3C browser QA requires the private synthetic database.");
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
  if (new URL(page.url()).pathname === "/accounts") {
    await page.locator('input[name="accountId"][value="stage3-account-fk-01"]').check();
    await Promise.all([
      page.waitForURL((url) => url.pathname !== "/accounts", { timeout: 20_000 }),
      page.getByRole("button", { name: "Select account" }).click(),
    ]);
  }
  return { context, page, errors };
}

async function navigateViaRenderedMarkLink(page, width) {
  if (width < 1280) {
    const trigger = page.getByRole("button", { name: "Open navigation" });
    if (await trigger.count() === 0) {
      throw new Error(`Missing mobile navigation trigger at ${page.url()}\n${(await page.locator("body").innerText()).slice(0, 2_000)}`);
    }
    await trigger.click();
    const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
    await Promise.all([page.waitForURL((url) => url.pathname === "/work/mark"), mobileNavigation.getByRole("link", { name: "Marking", exact: true }).click()]);
  } else {
    await Promise.all([page.waitForURL((url) => url.pathname === "/work/mark"), page.getByRole("link", { name: "Marking", exact: true }).click()]);
  }
  await page.getByRole("heading", { level: 1, name: "Marking" }).waitFor();
  return { path: new URL(page.url()).pathname, text: await page.locator("body").innerText() };
}

async function openConsignmentMark(page) {
  await page.goto(`${base}/work/mark?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: "Marking" }).waitFor();
}

async function clickCompletion(page, title) {
  const card = page.locator("[data-responsive-work-card]", { hasText: title }).first();
  await card.waitFor();
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/work/mark" && url.searchParams.has("success"), { timeout: 20_000 }),
    card.getByRole("button", { name: "Marking Completed" }).click(),
  ]);
  await page.locator("[data-responsive-work-card]", { hasText: title }).waitFor({ state: "detached" });
}

async function mutationTruth(lineId, expectedNext) {
  const tasks = await db.workTask.findMany({ where: { consignmentLineId: lineId }, orderBy: { sequenceNumber: "asc" } });
  const mark = tasks.find((task) => task.stage === "MARK");
  const next = tasks.find((task) => task.stage === expectedNext);
  const pack = tasks.find((task) => task.stage === "PACK");
  const route = JSON.parse(mark?.routeSnapshotJson ?? "{}");
  return {
    markStatus: mark?.status,
    nextStatus: next?.status,
    packStatus: pack?.status,
    actualStages: route.actualStages,
    completedStages: route.completedStages,
    currentStage: route.currentStage,
    routeDecisions: mark ? await db.workRouteDecision.count({ where: { taskId: mark.id } }) : -1,
    actionLogs: mark ? await db.workActionLog.count({ where: { taskId: mark.id, action: "TASK_COMPLETED" } }) : -1,
  };
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled; };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select,#app-shell-main summary")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44),
      text: document.body.innerText,
    };
  });
}

const errorsHealthy = (errors) => Object.values(errors).every((items) => items.length === 0);
const healthy = (inspection, errors) => inspection.clientWidth === inspection.scrollWidth && inspection.undersized.length === 0 && errorsHealthy(errors);
const cases = [
  { viewport: { width: 390, height: 844 }, id: "390x844", assemblyLine: "stage4-c3a-single-destination", assemblyTitle: "Synthetic C3A Mark with preselected Assembly", packLine: "stage4-c3a-preselected-pack", packTitle: "Synthetic C3A Mark with preselected Pack" },
  { viewport: { width: 1440, height: 900 }, id: "1440x900", assemblyLine: "stage4-c3a-single-destination-desktop", assemblyTitle: "Synthetic C3A desktop Mark with preselected Assembly", packLine: "stage4-c3a-preselected-pack-desktop", packTitle: "Synthetic C3A desktop Mark with preselected Pack" },
];

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
try {
  for (const testCase of cases) {
    const marker = await session(browser, testCase.viewport, "MARKER");
    const navigation = await navigateViaRenderedMarkLink(marker.page, testCase.viewport.width);
    const navigationInspection = await inspect(marker.page);
    results.push({ state: "CANONICAL_MARK_NAVIGATION", viewport: testCase.id, pass: navigation.path === "/work/mark" && navigation.text.includes("Review the product, marking instructions and quantity") && navigation.text.includes("Consignments") && healthy(navigationInspection, marker.errors), navigation, inspection: navigationInspection, errors: structuredClone(marker.errors) });

    await marker.page.goto(`${base}/work/marking`, { waitUntil: "domcontentloaded" });
    await marker.page.waitForURL((url) => url.pathname === "/work/mark" && url.searchParams.get("source") === "CONSIGNMENT");
    results.push({ state: "LEGACY_DEFAULT_REDIRECT", viewport: testCase.id, pass: new URL(marker.page.url()).pathname === "/work/mark" && new URL(marker.page.url()).searchParams.get("source") === "CONSIGNMENT", url: marker.page.url() });

    await marker.page.goto(`${base}/work/marking?q=STAGE-C3B-GALLERY-MARK`, { waitUntil: "domcontentloaded" });
    await marker.page.getByRole("heading", { level: 1, name: "Marking search and history" }).waitFor();
    const legacyCard = marker.page.locator("[data-responsive-work-card]", { hasText: "STAGE-C3B-GALLERY-MARK" }).first();
    await legacyCard.waitFor();
    await Promise.all([marker.page.waitForURL(/\/work\/marking\/stage4-c3b-gallery-mark$/), legacyCard.getByRole("link", { name: "Product and marking details" }).click()]);
    const backHref = await marker.page.getByRole("link", { name: "Back to Marking" }).getAttribute("href");
    results.push({ state: "LEGACY_SEARCH_AND_DETAIL", viewport: testCase.id, pass: new URL(marker.page.url()).pathname === "/work/marking/stage4-c3b-gallery-mark" && backHref === "/work/mark?source=CONSIGNMENT", path: new URL(marker.page.url()).pathname, backHref });

    await openConsignmentMark(marker.page);
    await clickCompletion(marker.page, testCase.assemblyTitle);
    const assemblyTruth = await mutationTruth(testCase.assemblyLine, "ASSEMBLE");
    results.push({ state: "PRESELECTED_ASSEMBLY_MUTATION", viewport: testCase.id, pass: assemblyTruth.markStatus === "COMPLETED" && assemblyTruth.nextStatus === "READY" && assemblyTruth.packStatus === "LOCKED" && JSON.stringify(assemblyTruth.actualStages) === JSON.stringify(["PICK", "MARK", "ASSEMBLE"]) && JSON.stringify(assemblyTruth.completedStages) === JSON.stringify(["PICK", "MARK"]) && assemblyTruth.currentStage === "ASSEMBLE" && assemblyTruth.routeDecisions === 0 && assemblyTruth.actionLogs === 1 && errorsHealthy(marker.errors), truth: assemblyTruth, errors: structuredClone(marker.errors) });

    await openConsignmentMark(marker.page);
    await clickCompletion(marker.page, testCase.packTitle);
    const packTruth = await mutationTruth(testCase.packLine, "PACK");
    results.push({ state: "PRESELECTED_PACK_MUTATION", viewport: testCase.id, pass: packTruth.markStatus === "COMPLETED" && packTruth.nextStatus === "READY" && JSON.stringify(packTruth.actualStages) === JSON.stringify(["PICK", "MARK", "PACK"]) && JSON.stringify(packTruth.completedStages) === JSON.stringify(["PICK", "MARK"]) && packTruth.currentStage === "PACK" && packTruth.routeDecisions === 0 && packTruth.actionLogs === 1 && errorsHealthy(marker.errors), truth: packTruth, errors: structuredClone(marker.errors) });

    if (testCase.id === "390x844") {
      await openConsignmentMark(marker.page);
      const partialCard = marker.page.locator("[data-responsive-work-card]", { hasText: "STAGE-C3B-GALLERY-MARK" }).first();
      const unresolvedCard = marker.page.locator("[data-responsive-work-card]", { hasText: "Synthetic C3A Mark with Pack and Assembly choices" }).first();
      await unresolvedCard.getByRole("button", { name: "Marking Completed" }).click();
      const routeDialog = marker.page.locator('[data-worker-overlay="PROCESS_FLOW"] [role="dialog"]');
      await routeDialog.waitFor();
      const routeText = await routeDialog.innerText();
      results.push({ state: "UNRESOLVED_PROCESS_FLOW", viewport: testCase.id, pass: routeText.includes("Send to Pack") && routeText.includes("Send to Assembly"), routeText });
      await marker.page.keyboard.press("Escape");
      await partialCard.getByRole("button", { name: "Partial Quantity" }).click();
      const dialog = marker.page.locator('[data-worker-overlay="PARTIAL_QUANTITY"] [role="dialog"]');
      await dialog.waitFor();
      await dialog.locator('input[name="targetQuantity"]').fill("4");
      await Promise.all([marker.page.waitForURL((url) => url.pathname === "/work/mark" && url.searchParams.has("success")), dialog.getByRole("button", { name: "Save partial quantity" }).click()]);
      const mark = await db.workTask.findUniqueOrThrow({ where: { id: "stage4-c3b-gallery-mark" } });
      const pack = await db.workTask.findUniqueOrThrow({ where: { id: "stage4-c3b-gallery-pack" } });
      results.push({ state: "NORMAL_PARTIAL_REMAINS_MARK", viewport: testCase.id, pass: mark.status === "IN_PROGRESS" && mark.completedQuantity === 4 && pack.status === "LOCKED" && await db.workRouteDecision.count({ where: { taskId: mark.id } }) === 0, mark: { status: mark.status, completedQuantity: mark.completedQuantity }, packStatus: pack.status });
    }
    await marker.context.close();
  }

  const assembler = await session(browser, { width: 390, height: 844 }, "ASSEMBLER");
  await assembler.page.goto(`${base}/work/assemble?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
  const assemblyText = await assembler.page.locator("body").innerText();
  results.push({ state: "ASSEMBLY_QUEUE_READY", viewport: "390x844", pass: assemblyText.includes("Synthetic C3A Mark with preselected Assembly") && !assemblyText.includes("Marking queue temporarily unavailable") && errorsHealthy(assembler.errors), errors: assembler.errors });
  await assembler.context.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C3CGroupedMarkBrowserV1", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`) }, null, 2));
if (failures.length) process.exitCode = 1;
