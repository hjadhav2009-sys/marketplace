import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c6a");
const ownerReview = path.join(output, "owner-review");
const stagingRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const credentials = JSON.parse(await readFile(path.join(stagingRoot, "credentials", "synthetic-users.json"), "utf8"));
const environment = JSON.parse(await readFile(path.join(stagingRoot, "runtime", "environment.json"), "utf8"));
const buildId = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C6A browser QA requires private synthetic staging.");
await mkdir(ownerReview, { recursive: true });

const db = new PrismaClient({ datasourceUrl: `file:${String(environment.databasePath).replace(/\\/g, "/")}` });
const main = { pick: "stage4-c3b-problem-pick", mark: "stage4-c3b-problem-mark", pack: "stage4-c3b-problem-pack", sku: "STAGE-C3B-PROBLEM-MARK" };
const ready = { mark: "stage4-c3b-manual-mark", pack: "stage4-c3b-manual-pack", sku: "STAGE-C3B-MANUAL-MARK" };
const assignees = { a: "stage3-marker", b: "stage4-c6a-marker-b", c: "stage4-c6a-marker-c" };

function credential(scenario) {
  const found = credentials.users.find((item) => item.scenario === scenario);
  if (!found) throw new Error(`Missing synthetic ${scenario} credential.`);
  return found;
}

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

function mergeErrors(...sets) {
  return Object.fromEntries(["console", "page", "requests", "responses"].map((key) => [key, sets.flatMap((set) => set[key])]));
}

function noErrors(errors) { return Object.values(errors).every((items) => items.length === 0); }

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !("disabled" in element && element.disabled);
    };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      undersized: controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 60), width: rect.width, height: rect.height };
      }).filter((item) => item.width < 44 || item.height < 44),
    };
  });
}

function healthy(inspection, errors) {
  return inspection.clientWidth === inspection.scrollWidth && inspection.undersized.length === 0 && noErrors(errors);
}

async function resetFixture() {
  await db.$transaction(async (tx) => {
    for (const [id, username, name] of [[assignees.b, "stage4-c6a-marker-b", "Synthetic C6A Marker B"], [assignees.c, "stage4-c6a-marker-c", "Synthetic C6A Marker C"]]) {
      await tx.user.upsert({ where: { id }, create: { id, username, passwordHash: "synthetic-only", name, role: "PICKER", active: true, accountId: "stage3-account-fk-01", canMark: true }, update: { active: true, accountId: "stage3-account-fk-01", canMark: true } });
    }
    const taskIds = [main.pick, main.mark, main.pack, ready.mark, ready.pack];
    await tx.workActionLog.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.workTask.upsert({
      where: { id: main.pick },
      create: { id: main.pick, accountId: "stage3-account-fk-01", sourceType: "CONSIGNMENT", consignmentLineId: "stage4-c3b-problem", stage: "PICK", sequenceNumber: 1, requiredQuantity: 3, completedQuantity: 3, status: "COMPLETED", completedAt: new Date(), completedByUserId: "stage3-owner" },
      update: { completedQuantity: 3, status: "COMPLETED", completedAt: new Date(), completedByUserId: "stage3-owner" },
    });
    await tx.workTask.update({ where: { id: main.mark }, data: { status: "IN_PROGRESS", statusBeforeProblem: null, completedQuantity: 0, assignedUserId: assignees.a, startedAt: new Date(), startedByUserId: assignees.a, problemReason: null, problemReportedAt: null, problemReportedByUserId: null, problemResolutionNote: null, problemResolvedAt: null, problemResolvedByUserId: null } });
    await tx.workTask.update({ where: { id: main.pack }, data: { status: "LOCKED", completedQuantity: 0, assignedUserId: null } });
    await tx.workTask.update({ where: { id: ready.mark }, data: { status: "READY", statusBeforeProblem: null, completedQuantity: 0, assignedUserId: assignees.a, startedAt: null, startedByUserId: null, problemReason: null, problemReportedAt: null, problemReportedByUserId: null, problemResolutionNote: null, problemResolvedAt: null, problemResolvedByUserId: null } });
    await tx.workTask.update({ where: { id: ready.pack }, data: { status: "LOCKED", completedQuantity: 0, assignedUserId: null } });
  });
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

async function reportThroughWorkerUi(page, taskId, reason) {
  await page.goto(`${base}/work/consignments/items/${taskId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Problem", exact: true }).click();
  const overlay = page.locator('[data-worker-overlay="PROBLEM"] [role="dialog"]');
  await overlay.waitFor();
  await overlay.locator('select[name="reason"]').selectOption(reason);
  await overlay.locator('textarea[name="note"]').fill("C6A synthetic browser report through the worker UI.");
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("success") === "Problem reported", { timeout: 20_000 }),
    overlay.getByRole("button", { name: "Report problem", exact: true }).click(),
  ]);
}

async function openProblemCard(page, sku) {
  await page.goto(`${base}/work/problems?source=CONSIGNMENT&stage=MARK`, { waitUntil: "domcontentloaded" });
  const card = page.locator("[data-problem-card]", { hasText: sku }).first();
  await card.waitFor();
  return card;
}

async function reassign(page, sku, assignedUserId) {
  const card = await openProblemCard(page, sku);
  await card.getByRole("button", { name: "Reassign" }).click();
  const overlay = page.locator('[data-worker-overlay="PROBLEM"] [role="dialog"]');
  await overlay.waitFor();
  const requestId = await overlay.locator('input[name="clientRequestId"]').inputValue();
  await overlay.locator('select[name="assignedUserId"]').selectOption(assignedUserId);
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("success")?.includes("assignment updated"), { timeout: 20_000 }),
    overlay.getByRole("button", { name: "Update assignment" }).click(),
  ]);
  return requestId;
}

async function resolve(page, sku, note) {
  const card = await openProblemCard(page, sku);
  await card.getByRole("button", { name: "Resolve" }).click();
  const overlay = page.locator('[data-worker-overlay="PROBLEM"] [role="dialog"]');
  await overlay.waitFor();
  await overlay.locator('textarea[name="resolutionNote"]').fill(note);
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get("success")?.includes("problem resolved"), { timeout: 20_000 }),
    overlay.getByRole("button", { name: "Resolve and return to work" }).click(),
  ]);
  return inspect(page);
}

async function scannerRegression(page) {
  await page.goto(`${base}/work/scan`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-universal-scan-input]").fill("stage4-c3a-multi-choice-mark");
  await page.locator('select[name="intent"]').selectOption("MARK");
  await page.locator('select[name="source"]').selectOption("CONSIGNMENTS");
  await Promise.all([page.waitForURL((url) => url.searchParams.get("q") === "stage4-c3a-multi-choice-mark", { timeout: 20_000 }), page.getByRole("button", { name: "Find work" }).click()]);
  const button = page.getByRole("button", { name: "Marking Completed" }).first();
  await button.click();
  const dialog = page.locator('[data-worker-overlay="PROCESS_FLOW"] [role="dialog"]');
  await dialog.waitFor();
  const text = (await dialog.innerText()).toLowerCase();
  const inspection = await inspect(page);
  await page.keyboard.press("Escape");
  return { pass: text.includes("send to assembly") && text.includes("send to pack"), inspection };
}

async function runViewport(browser, viewport) {
  await resetFixture();
  const marker = await session(browser, viewport, "MARKER");
  await reportThroughWorkerUi(marker.page, main.mark, "MARKING_FILE_WRONG");
  const reportedMain = await db.workTask.findUniqueOrThrow({ where: { id: main.mark } });
  await reportThroughWorkerUi(marker.page, ready.mark, "MARKING_FILE_MISSING");
  const reportedReady = await db.workTask.findUniqueOrThrow({ where: { id: ready.mark } });

  const owner = await session(browser, viewport, "OWNER");
  const firstRequestId = await reassign(owner.page, main.sku, assignees.b);
  const first = await db.workTask.findUniqueOrThrow({ where: { id: main.mark } });
  const secondRequestId = await reassign(owner.page, main.sku, assignees.c);
  const second = await db.workTask.findUniqueOrThrow({ where: { id: main.mark } });
  const assignmentLogs = await db.workActionLog.count({ where: { taskId: main.mark, action: "TASK_REASSIGNED" } });
  const resolutionLogsBeforeResolve = await db.workActionLog.count({ where: { taskId: main.mark, action: "TASK_PROBLEM_RESOLVED" } });
  const reassignInspection = await inspect(owner.page);

  const fidelityInspection = await resolve(owner.page, main.sku, "C6A IN_PROGRESS quantity-zero fidelity proof.");
  const [pick, mark, pack] = await Promise.all([main.pick, main.mark, main.pack].map((id) => db.workTask.findUniqueOrThrow({ where: { id } })));
  const readyInspection = await resolve(owner.page, ready.sku, "C6A READY restoration proof.");
  const readyMark = await db.workTask.findUniqueOrThrow({ where: { id: ready.mark } });
  await owner.page.screenshot({ path: path.join(ownerReview, `${viewport.width}-problem-fidelity-v2.png`), fullPage: true });

  const scanner = await session(browser, viewport, "MARKER");
  const scannerResult = await scannerRegression(scanner.page);
  await scanner.page.screenshot({ path: path.join(ownerReview, `${viewport.width}-scanner-regression-v2.png`), fullPage: true });
  const sharedErrors = mergeErrors(marker.errors, owner.errors);
  const viewportName = `${viewport.width}x${viewport.height}`;
  const results = [
    { state: "IN_PROGRESS_STATE_FIDELITY", viewport: viewportName, pass: reportedMain.status === "PROBLEM" && reportedMain.statusBeforeProblem === "IN_PROGRESS" && reportedMain.completedQuantity === 0 && pick.status === "COMPLETED" && mark.status === "IN_PROGRESS" && mark.completedQuantity === 0 && mark.assignedUserId === assignees.c && pack.status === "LOCKED" && healthy(fidelityInspection, sharedErrors), inspection: fidelityInspection, errors: sharedErrors },
    { state: "REPEATABLE_REASSIGNMENT", viewport: viewportName, pass: firstRequestId !== secondRequestId && first.status === "PROBLEM" && first.assignedUserId === assignees.b && second.status === "PROBLEM" && second.assignedUserId === assignees.c && assignmentLogs === 2 && resolutionLogsBeforeResolve === 0 && healthy(reassignInspection, sharedErrors), requestIdsDistinct: firstRequestId !== secondRequestId, assignmentLogs, resolutionLogsBeforeResolve, inspection: reassignInspection, errors: sharedErrors },
    { state: "READY_STATE_FIDELITY", viewport: viewportName, pass: reportedReady.status === "PROBLEM" && reportedReady.statusBeforeProblem === "READY" && reportedReady.completedQuantity === 0 && readyMark.status === "READY" && readyMark.completedQuantity === 0 && healthy(readyInspection, sharedErrors), inspection: readyInspection, errors: sharedErrors },
    { state: "SCANNER_UNRESOLVED_MARK", viewport: viewportName, pass: scannerResult.pass && healthy(scannerResult.inspection, scanner.errors), inspection: scannerResult.inspection, errors: scanner.errors },
  ];
  await Promise.all([marker.context.close(), owner.context.close(), scanner.context.close()]);
  return results;
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
let results = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) results.push(...await runViewport(browser, viewport));
} finally {
  await browser.close();
  await db.$disconnect();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C6AProblemStateFidelityBrowserV2", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", sourceSha: environment.sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report-v2.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ records: results.length, failures: failures.length, sourceSha: environment.sourceSha, buildId }, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
