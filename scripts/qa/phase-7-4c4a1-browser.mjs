import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const stagingRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const credentials = JSON.parse(await readFile(path.join(stagingRoot, "credentials", "synthetic-users.json"), "utf8"));
const environment = JSON.parse(await readFile(path.join(stagingRoot, "runtime", "environment.json"), "utf8"));
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C4A.1 browser QA requires private synthetic staging.");
const db = new PrismaClient({ datasourceUrl: `file:${String(environment.databasePath).replace(/\\/g, "/")}` });

function credential(scenario) {
  const item = credentials.users.find((entry) => entry.scenario === scenario);
  if (!item) throw new Error(`Missing synthetic ${scenario} credential.`);
  return item;
}

async function session(browser, viewport, scenario) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.route(/https:\/\/(invalid\.example\.invalid|example\.invalid)\//, (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-image" }));
  const page = await context.newPage();
  const user = credential(scenario);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(user.username);
  await page.locator('input[name="password"]').fill(user.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }), page.locator("form").first().evaluate((form) => form.requestSubmit())]);
  if (new URL(page.url()).pathname === "/accounts") {
    await page.locator('input[name="accountId"][value="stage3-account-fk-01"]').check();
    await Promise.all([page.waitForURL((url) => url.pathname !== "/accounts", { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]);
  }
  return { context, page };
}

async function completeFromScanner(page, sku) {
  await page.goto(`${base}/work/scan`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-universal-scan-input]").fill(sku);
  await page.locator('select[name="intent"]').selectOption("ASSEMBLE");
  await page.locator('select[name="source"]').selectOption("CONSIGNMENTS");
  await Promise.all([page.waitForURL((url) => url.searchParams.get("q") === sku, { timeout: 20_000 }), page.getByRole("button", { name: "Find work" }).click()]);
  const candidate = page.locator("[data-scanner-candidate]", { hasText: sku }).first();
  await candidate.waitFor();
  await Promise.all([page.waitForURL((url) => url.searchParams.has("scanSuccess"), { timeout: 20_000 }), candidate.getByRole("button", { name: "Assembly Completed" }).click()]);
}

if (process.env.C4A1_PREFLIGHT !== "1") throw new Error("Final C4A.1 browser matrix has not been enabled yet.");
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
try {
  const origin = await session(browser, { width: 390, height: 844 }, "ASSEMBLER");
  const scanner = await session(browser, { width: 390, height: 844 }, "ASSEMBLER");
  const sku = "STAGE-C4-CONSIGNMENT-PROGRESS";
  await origin.page.goto(`${base}/work/assemble?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
  const card = origin.page.locator("[data-responsive-work-card]", { hasText: sku }).first();
  await card.waitFor();
  await completeFromScanner(scanner.page, sku);
  await origin.page.waitForTimeout(2_000);
  const task = await db.workTask.findUniqueOrThrow({ where: { id: "stage4-c4-line-progress-assemble" } });
  const pack = await db.workTask.findUniqueOrThrow({ where: { id: "stage4-c4-line-progress-pack" } });
  if (task.status !== "COMPLETED" || pack.status !== "READY" || await card.count() !== 1 || !await card.isVisible()) throw new Error("Origin live-stale preflight did not reproduce as expected.");
  console.log("CONFIRMED_INDIVIDUAL_ORIGIN_CARD_LIVE_STALE");
  await origin.context.close();
  await scanner.context.close();
} finally {
  await browser.close();
  await db.$disconnect();
}
