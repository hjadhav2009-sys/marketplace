import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c4a");
const stagingRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const credentials = JSON.parse(await readFile(path.join(stagingRoot, "credentials", "synthetic-users.json"), "utf8"));
const environment = JSON.parse(await readFile(path.join(stagingRoot, "runtime", "environment.json"), "utf8"));
const buildId = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C4A browser QA requires the private synthetic database.");

await mkdir(output, { recursive: true });
const db = new PrismaClient({ datasourceUrl: `file:${String(environment.databasePath).replace(/\\/g, "/")}` });
const cases = [
  { viewport: { width: 390, height: 844 }, sku: "STAGE-C4-CONSIGNMENT-READY", lineId: "stage4-c4-line-ready", assemblyId: "stage4-c4-line-ready-assemble", packId: "stage4-c4-line-ready-pack" },
  { viewport: { width: 1440, height: 900 }, sku: "STAGE-C4-CONSIGNMENT-PROGRESS", lineId: "stage4-c4-line-progress", assemblyId: "stage4-c4-line-progress-assemble", packId: "stage4-c4-line-progress-pack" },
];

function credential(scenario) {
  const item = credentials.users.find((entry) => entry.scenario === scenario);
  if (!item) throw new Error(`Missing synthetic ${scenario} credential.`);
  return item;
}

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
    await Promise.all([page.waitForURL((url) => url.pathname !== "/accounts", { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]);
  }
  return { context, page, errors };
}

async function inspect(page, width) {
  return page.evaluate((desktop) => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled; };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select,#app-shell-main summary")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      currentPages: document.querySelectorAll('[aria-current="page"]').length,
      expectedCurrentPages: desktop ? 1 : 0,
      undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44),
      text: document.body.innerText,
    };
  }, width >= 1280);
}

const errorsHealthy = (errors) => Object.values(errors).every((items) => items.length === 0);
const inspectionHealthy = (value) => value.clientWidth === value.scrollWidth && value.currentPages <= 1 && value.undersized.length === 0;
const results = [];
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });

try {
  for (const testCase of cases) {
    const viewportId = `${testCase.viewport.width}x${testCase.viewport.height}`;
    const assembler = await session(browser, testCase.viewport, "ASSEMBLER");
    const packer = await session(browser, testCase.viewport, "PACKER");

    await packer.page.goto(`${base}/work/pack?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
    await packer.page.getByText(/Live work updates connected|Live reconnecting/).waitFor({ timeout: 20_000 });
    const packBefore = await inspect(packer.page, testCase.viewport.width);
    const absentBefore = !packBefore.text.includes(testCase.sku);

    await assembler.page.goto(`${base}/work/scan`, { waitUntil: "domcontentloaded" });
    await assembler.page.locator('[data-universal-scan-input]').fill(testCase.sku);
    await assembler.page.locator('select[name="intent"]').selectOption("ASSEMBLE");
    await assembler.page.locator('select[name="source"]').selectOption("CONSIGNMENTS");
    await Promise.all([
      assembler.page.waitForURL((url) => url.pathname === "/work/scan" && url.searchParams.get("q") === testCase.sku, { timeout: 20_000 }),
      assembler.page.getByRole("button", { name: "Find work" }).click(),
    ]);
    const candidate = assembler.page.locator("[data-scanner-candidate]", { hasText: testCase.sku }).first();
    await candidate.waitFor({ timeout: 20_000 });
    const scanBefore = await inspect(assembler.page, testCase.viewport.width);
    await Promise.all([
      assembler.page.waitForURL((url) => url.pathname === "/work/scan" && url.searchParams.has("scanSuccess"), { timeout: 20_000 }),
      candidate.getByRole("button", { name: "Assembly Completed" }).click(),
    ]);
    const scanAfter = await inspect(assembler.page, testCase.viewport.width);

    let liveVisible = false;
    try {
      await packer.page.waitForFunction((sku) => document.body.innerText.includes(sku), testCase.sku, { timeout: 15_000 });
      liveVisible = true;
    } catch {
      liveVisible = false;
    }
    const packAfter = await inspect(packer.page, testCase.viewport.width);
    const assembly = await db.workTask.findUniqueOrThrow({ where: { id: testCase.assemblyId } });
    const pack = await db.workTask.findUniqueOrThrow({ where: { id: testCase.packId } });
    const route = JSON.parse(assembly.routeSnapshotJson ?? "{}");
    const membership = await db.workGroupMember.count({ where: { taskId: testCase.packId, projection: { accountId: assembly.accountId, sourceType: "CONSIGNMENT", stage: "PACK" } } });
    const completionEvents = await db.workChangeEvent.count({ where: { accountId: assembly.accountId, eventType: "STAGE_COMPLETED", stage: "ASSEMBLE", entityId: testCase.assemblyId } });
    const routedEvents = await db.workChangeEvent.count({ where: { accountId: assembly.accountId, eventType: "WORK_ROUTED", stage: "PACK", entityId: testCase.assemblyId } });
    const completionLogs = await db.workActionLog.count({ where: { taskId: testCase.assemblyId, action: "TASK_COMPLETED" } });

    results.push({
      state: "UNIVERSAL_SCANNER_INDIVIDUAL_HANDOFF",
      viewport: viewportId,
      pass: absentBefore && scanBefore.text.includes(testCase.sku) && scanAfter.text.includes("Action completed. Scan the next item.") && assembly.status === "COMPLETED" && pack.status === "READY" && route.currentStage === "PACK" && membership === 1 && completionEvents === 1 && routedEvents === 1 && completionLogs === 1 && liveVisible && packAfter.text.includes(testCase.sku) && inspectionHealthy(scanBefore) && inspectionHealthy(scanAfter) && inspectionHealthy(packBefore) && inspectionHealthy(packAfter) && errorsHealthy(assembler.errors) && errorsHealthy(packer.errors),
      truth: { assembly: assembly.status, pack: pack.status, currentStage: route.currentStage, membership, completionEvents, routedEvents, completionLogs, liveVisible },
      inspection: { scanBefore, scanAfter, packBefore, packAfter },
      errors: { assembler: assembler.errors, packer: packer.errors },
    });

    if (testCase.viewport.width === 390) {
      await assembler.page.goto(`${base}/work/consignments/assemble`, { waitUntil: "domcontentloaded" });
      const queue = await inspect(assembler.page, testCase.viewport.width);
      await assembler.page.goto(`${base}/work/consignments/items/${testCase.assemblyId}`, { waitUntil: "domcontentloaded" });
      const detail = await inspect(assembler.page, testCase.viewport.width);
      results.push({ state: "LEGACY_INDIVIDUAL_ASSEMBLY_PATH", viewport: viewportId, pass: queue.text.includes("Consignment Assembly") && detail.text.includes(testCase.sku) && detail.text.includes("Task and action history") && detail.text.includes("ASSEMBLE: COMPLETED") && detail.text.includes("PACK: READY") && inspectionHealthy(queue) && inspectionHealthy(detail) && errorsHealthy(assembler.errors), inspection: { queue, detail }, errors: assembler.errors });
    }

    await packer.page.screenshot({ path: path.join(output, `pack-live-${viewportId}.png`), fullPage: true, animations: "disabled", caret: "hide" });
    await assembler.context.close();
    await packer.context.close();
  }
} finally {
  await browser.close();
  await db.$disconnect();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C4AIndividualHandoffBrowserV1", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", runtimeSha: environment.sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), runtimeSha: environment.sourceSha, buildId }, null, 2));
if (failures.length) process.exitCode = 1;
