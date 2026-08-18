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
const taskIds = { pick: "stage4-c3b-problem-pick", mark: "stage4-c3b-problem-mark", pack: "stage4-c3b-problem-pack" };

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

async function resetFixture() {
  await db.$transaction(async (tx) => {
    await tx.workActionLog.deleteMany({ where: { taskId: { in: Object.values(taskIds) } } });
    await tx.workTask.upsert({
      where: { id: taskIds.pick },
      create: { id: taskIds.pick, accountId: "stage3-account-fk-01", sourceType: "CONSIGNMENT", consignmentLineId: "stage4-c3b-problem", stage: "PICK", sequenceNumber: 1, requiredQuantity: 3, completedQuantity: 3, status: "COMPLETED", completedAt: new Date(), completedByUserId: "stage3-owner" },
      update: { completedQuantity: 3, status: "COMPLETED", completedAt: new Date(), completedByUserId: "stage3-owner" },
    });
    await tx.workTask.update({ where: { id: taskIds.mark }, data: { status: "PROBLEM", statusBeforeProblem: "IN_PROGRESS", completedQuantity: 0, assignedUserId: "stage3-marker", problemReason: "MARKING_FILE_WRONG", problemReportedAt: new Date(), problemReportedByUserId: "stage3-marker", problemResolutionNote: null, problemResolvedAt: null, problemResolvedByUserId: null } });
    await tx.workTask.update({ where: { id: taskIds.pack }, data: { status: "LOCKED", completedQuantity: 0 } });
  });
}

async function ownerSession(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.route(/https:\/\/(invalid\.example\.invalid|example\.invalid)\//, (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-image" }));
  const page = await context.newPage();
  const errors = monitor(page);
  const user = credential("OWNER");
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

async function openTargetCard(page, pathName) {
  await page.goto(`${base}${pathName}`, { waitUntil: "domcontentloaded" });
  const card = page.locator("[data-problem-card]", { hasText: "STAGE-C3B-PROBLEM-MARK" }).first();
  await card.waitFor();
  return card;
}

async function reassign(page, pathName, assignedUserId) {
  const card = await openTargetCard(page, pathName);
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

async function runScenario(browser, viewport) {
  await resetFixture();
  const session = await ownerSession(browser, viewport);
  const pathName = "/work/problems?source=CONSIGNMENT&stage=MARK";
  try {
    const firstRequestId = await reassign(session.page, pathName, "stage3-owner");
    const afterFirst = await db.workTask.findUniqueOrThrow({ where: { id: taskIds.mark } });
    const firstStayedOpen = afterFirst.status === "PROBLEM" && afterFirst.assignedUserId === "stage3-owner";
    const secondRequestId = await reassign(session.page, pathName, "stage3-marker");
    const afterSecond = await db.workTask.findUniqueOrThrow({ where: { id: taskIds.mark } });
    const logs = await db.workActionLog.count({ where: { taskId: taskIds.mark, action: "TASK_REASSIGNED" } });

    const card = await openTargetCard(session.page, pathName);
    await card.getByRole("button", { name: "Resolve" }).click();
    const overlay = session.page.locator('[data-worker-overlay="PROBLEM"] [role="dialog"]');
    await overlay.waitFor();
    await overlay.locator('textarea[name="resolutionNote"]').fill("C6A synthetic prior-state fidelity browser proof.");
    await Promise.all([
      session.page.waitForURL((url) => url.searchParams.get("success")?.includes("problem resolved"), { timeout: 20_000 }),
      overlay.getByRole("button", { name: "Resolve and return to work" }).click(),
    ]);

    const [pick, mark, pack] = await Promise.all(Object.values(taskIds).map((id) => db.workTask.findUniqueOrThrow({ where: { id } })));
    const inspection = await inspect(session.page);
    await session.page.screenshot({ path: path.join(ownerReview, `${viewport.width}-problem-fidelity.png`), fullPage: true });
    return {
      viewport: `${viewport.width}x${viewport.height}`,
      pass: firstRequestId !== secondRequestId
        && firstStayedOpen
        && afterSecond.status === "PROBLEM"
        && afterSecond.assignedUserId === "stage3-marker"
        && logs === 2
        && pick.status === "COMPLETED"
        && mark.status === "IN_PROGRESS"
        && mark.completedQuantity === 0
        && mark.assignedUserId === "stage3-marker"
        && pack.status === "LOCKED"
        && inspection.clientWidth === inspection.scrollWidth
        && inspection.undersized.length === 0
        && noErrors(session.errors),
      requestIdsDistinct: firstRequestId !== secondRequestId,
      firstStayedOpen,
      secondStayedOpen: afterSecond.status === "PROBLEM",
      assignmentLogs: logs,
      finalStates: { pick: pick.status, mark: mark.status, markQuantity: mark.completedQuantity, pack: pack.status, assignedUserId: mark.assignedUserId },
      inspection,
      errors: session.errors,
    };
  } finally {
    await session.context.close();
  }
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
let results;
try {
  results = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) results.push(await runScenario(browser, viewport));
} finally {
  await browser.close();
  await db.$disconnect();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C6AProblemStateFidelityBrowserV1", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", sourceSha: environment.sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ records: results.length, failures: failures.length, sourceSha: environment.sourceSha, buildId }, null, 2));
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
