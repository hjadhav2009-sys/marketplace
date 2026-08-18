import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c4a1");
const stagingRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const credentials = JSON.parse(await readFile(path.join(stagingRoot, "credentials", "synthetic-users.json"), "utf8"));
const environment = JSON.parse(await readFile(path.join(stagingRoot, "runtime", "environment.json"), "utf8"));
const buildId = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C4A.1 browser QA requires private synthetic staging.");
await mkdir(output, { recursive: true });
const db = new PrismaClient({ datasourceUrl: `file:${String(environment.databasePath).replace(/\\/g, "/")}` });

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

async function openStage(page, stage) {
  const streamReady = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/work/live" && response.status() === 200;
  }, { timeout: 20_000 });
  await page.goto(`${base}/work/${stage.toLowerCase()}?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
  await streamReady;
  await page.getByText(/Live work updates connected|Live reconnecting/).waitFor({ timeout: 20_000 });
}

function card(page, input) {
  return page.locator("[data-responsive-work-card]").filter({ has: page.getByText(`Seller SKU ${input.sku}`, { exact: true }) }).first();
}

async function completeFromScanner(page, input) {
  await page.goto(`${base}/work/scan`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-universal-scan-input]").fill(input.sku);
  await page.locator('select[name="intent"]').selectOption(input.stage);
  await page.locator('select[name="source"]').selectOption("CONSIGNMENTS");
  await Promise.all([page.waitForURL((url) => url.searchParams.get("q") === input.sku, { timeout: 20_000 }), page.getByRole("button", { name: "Find work" }).click()]);
  const candidate = page.locator("[data-scanner-candidate]").filter({ has: page.getByText(input.sku, { exact: true }) }).first();
  await candidate.waitFor({ timeout: 20_000 });
  await Promise.all([page.waitForURL((url) => url.searchParams.has("scanSuccess"), { timeout: 20_000 }), candidate.getByRole("button", { name: input.stage === "ASSEMBLE" ? "Assembly Completed" : "Complete stage" }).click()]);
}

async function summaryCount(page) {
  const source = page.locator('[data-assembly-source-selector] a[href*="source=CONSIGNMENT"], [data-mark-source-selector] a[href*="source=CONSIGNMENT"], [role="tab"][href*="source=CONSIGNMENT"]').first();
  const text = await source.innerText();
  const match = text.match(/(\d+)\s+(?:open|cards)/);
  if (!match) throw new Error(`Could not read Consignments summary from: ${text}`);
  return Number(match[1]);
}

async function waitForSummaryCount(page, expected) {
  const deadline = Date.now() + 10_000;
  let current = await summaryCount(page);
  while (current !== expected && Date.now() < deadline) {
    await page.waitForTimeout(100);
    current = await summaryCount(page);
  }
  if (current !== expected) throw new Error(`Expected summary count ${expected}, received ${current}.`);
  return current;
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled; };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select,#app-shell-main summary")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      currentPages: document.querySelectorAll('[aria-current="page"]').length,
      undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44),
      inert: Boolean(document.querySelector("#app-shell-main")?.hasAttribute("inert")),
    };
  });
}

async function routeTruth(input) {
  const tasks = await db.workTask.findMany({ where: { consignmentLineId: input.lineId }, orderBy: { sequenceNumber: "asc" } });
  const completed = tasks.find((task) => task.id === input.taskId);
  const next = tasks.find((task) => task.stage === input.nextStage);
  const snapshots = tasks.map((task) => task.routeSnapshotJson);
  const parsed = snapshots.map((value) => JSON.parse(value ?? "{}"));
  return {
    completedStatus: completed?.status,
    nextStatus: next?.status,
    downstreamPackStatus: tasks.find((task) => task.stage === "PACK")?.status,
    snapshotsIdentical: new Set(snapshots).size === 1,
    actualStages: parsed[0]?.actualStages,
    completedStages: parsed[0]?.completedStages,
    currentStage: parsed[0]?.currentStage,
    selectedNextStage: parsed[0]?.selectedNextStage,
    routeVersion: parsed[0]?.routeVersion,
    completionEvents: await db.workChangeEvent.count({ where: { entityId: input.taskId, eventType: "STAGE_COMPLETED", stage: input.stage } }),
    routedEvents: await db.workChangeEvent.count({ where: { entityId: input.taskId, eventType: "WORK_ROUTED", stage: input.nextStage } }),
    completionLogs: await db.workActionLog.count({ where: { taskId: input.taskId, action: "TASK_COMPLETED" } }),
    routeDecisions: await db.workRouteDecision.count({ where: { taskId: input.taskId } }),
  };
}

const errorsHealthy = (errors) => Object.values(errors).every((items) => items.length === 0);
const inspectionHealthy = (value) => value.clientWidth === value.scrollWidth && value.undersized.length === 0 && value.currentPages <= 1 && !value.inert;
const cases = [
  {
    viewport: { width: 390, height: 844 }, id: "390x844",
    assembly: { sku: "STAGE-C4-CONSIGNMENT-READY", lineId: "stage4-c4-line-ready", taskId: "stage4-c4-line-ready-assemble", stage: "ASSEMBLE", nextStage: "PACK", expectedActual: ["PICK", "ASSEMBLE", "PACK"], expectedCompleted: ["PICK", "ASSEMBLE"] },
    markPack: { sku: "STAGE-C3A-PRESELECTED-PACK", lineId: "stage4-c3a-preselected-pack", taskId: "stage4-c3a-preselected-pack-mark", stage: "MARK", nextStage: "PACK", expectedActual: ["PICK", "MARK", "PACK"], expectedCompleted: ["PICK", "MARK"] },
    markAssembly: { sku: "STAGE-C3A-SINGLE-DESTINATION", lineId: "stage4-c3a-single-destination", taskId: "stage4-c3a-single-destination-mark", stage: "MARK", nextStage: "ASSEMBLE", expectedActual: ["PICK", "MARK", "ASSEMBLE"], expectedCompleted: ["PICK", "MARK"] },
  },
  {
    viewport: { width: 1440, height: 900 }, id: "1440x900",
    assembly: { sku: "STAGE-C4-CONSIGNMENT-PROGRESS", lineId: "stage4-c4-line-progress", taskId: "stage4-c4-line-progress-assemble", stage: "ASSEMBLE", nextStage: "PACK", expectedActual: ["PICK", "ASSEMBLE", "PACK"], expectedCompleted: ["PICK", "ASSEMBLE"] },
    markPack: { sku: "STAGE-C3A-PRESELECTED-PACK-DESKTOP", lineId: "stage4-c3a-preselected-pack-desktop", taskId: "stage4-c3a-preselected-pack-desktop-mark", stage: "MARK", nextStage: "PACK", expectedActual: ["PICK", "MARK", "PACK"], expectedCompleted: ["PICK", "MARK"] },
    markAssembly: { sku: "STAGE-C3A-SINGLE-DESTINATION-DESKTOP", lineId: "stage4-c3a-single-destination-desktop", taskId: "stage4-c3a-single-destination-desktop-mark", stage: "MARK", nextStage: "ASSEMBLE", expectedActual: ["PICK", "MARK", "ASSEMBLE"], expectedCompleted: ["PICK", "MARK"] },
  },
];

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
try {
  for (const testCase of cases) {
    const markerOrigin = await session(browser, testCase.viewport, "MARKER");
    const markerScanner = await session(browser, testCase.viewport, "MARKER");
    const assemblerStage = await session(browser, testCase.viewport, "ASSEMBLER");
    const assemblerScanner = await session(browser, testCase.viewport, "ASSEMBLER");
    const packerStage = await session(browser, testCase.viewport, "PACKER");
    const sessions = [markerOrigin, markerScanner, assemblerStage, assemblerScanner, packerStage];
    await openStage(markerOrigin.page, "MARK");
    await openStage(assemblerStage.page, "ASSEMBLE");
    await openStage(packerStage.page, "PACK");
    const flows = [
      { name: "ASSEMBLY_TO_PACK", input: testCase.assembly, origin: assemblerStage.page, destination: packerStage.page, scanner: assemblerScanner.page },
      { name: "MARK_TO_PACK", input: testCase.markPack, origin: markerOrigin.page, destination: packerStage.page, scanner: markerScanner.page },
      { name: "MARK_TO_ASSEMBLY", input: testCase.markAssembly, origin: markerOrigin.page, destination: assemblerStage.page, scanner: markerScanner.page },
    ];
    for (const flow of flows) {
      const originCard = card(flow.origin, flow.input);
      await originCard.waitFor({ timeout: 20_000 });
      const destinationCard = card(flow.destination, flow.input);
      const absentBefore = await destinationCard.count() === 0;
      const originBefore = await summaryCount(flow.origin);
      const destinationBefore = await summaryCount(flow.destination);
      await completeFromScanner(flow.scanner, flow.input);
      await originCard.waitFor({ state: "detached", timeout: 20_000 });
      await destinationCard.waitFor({ timeout: 20_000 });
      const originAfter = await waitForSummaryCount(flow.origin, originBefore - 1);
      const destinationAfter = await waitForSummaryCount(flow.destination, destinationBefore + 1);
      const truth = await routeTruth(flow.input);
      const originInspection = await inspect(flow.origin);
      const destinationInspection = await inspect(flow.destination);
      const focusUsable = await destinationCard.getByRole("button").first().evaluate((element) => { element.focus(); return document.activeElement === element && element.matches(":focus-visible"); });
      const pass = absentBefore && originAfter === originBefore - 1 && destinationAfter === destinationBefore + 1
        && truth.completedStatus === "COMPLETED" && truth.nextStatus === "READY"
        && (flow.input.nextStage !== "ASSEMBLE" || truth.downstreamPackStatus === "LOCKED")
        && truth.snapshotsIdentical
        && JSON.stringify(truth.actualStages) === JSON.stringify(flow.input.expectedActual)
        && JSON.stringify(truth.completedStages) === JSON.stringify(flow.input.expectedCompleted)
        && truth.currentStage === flow.input.nextStage && truth.selectedNextStage === flow.input.nextStage
        && truth.completionEvents === 1 && truth.routedEvents === 1 && truth.completionLogs === 1 && truth.routeDecisions === 0
        && focusUsable && inspectionHealthy(originInspection) && inspectionHealthy(destinationInspection)
        && sessions.every((item) => errorsHealthy(item.errors));
      results.push({ state: flow.name, viewport: testCase.id, pass, absentBefore, summary: { originBefore, originAfter, destinationBefore, destinationAfter }, truth, focusUsable, inspections: { origin: originInspection, destination: destinationInspection }, errors: Object.fromEntries(sessions.map((item, index) => [index, structuredClone(item.errors)])) });
    }
    await packerStage.page.screenshot({ path: path.join(output, `pack-destination-${testCase.id}.png`), fullPage: true, animations: "disabled", caret: "hide" });
    await assemblerStage.page.screenshot({ path: path.join(output, `assembly-destination-${testCase.id}.png`), fullPage: true, animations: "disabled", caret: "hide" });
    for (const item of sessions) await item.context.close();
  }
} finally {
  await browser.close();
  await db.$disconnect();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C4A1HandoffTruthBrowserV1", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", runtimeSha: environment.sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), runtimeSha: environment.sourceSha, buildId }, null, 2));
if (failures.length) process.exitCode = 1;
