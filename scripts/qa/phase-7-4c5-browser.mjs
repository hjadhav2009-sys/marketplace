import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c5");
const ownerReview = path.join(output, "owner-review");
const stagingRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const credentials = JSON.parse(await readFile(path.join(stagingRoot, "credentials", "synthetic-users.json"), "utf8"));
const environment = JSON.parse(await readFile(path.join(stagingRoot, "runtime", "environment.json"), "utf8"));
const buildId = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C5 browser QA requires private synthetic staging.");
await mkdir(ownerReview, { recursive: true });
const db = new PrismaClient({ datasourceUrl: `file:${String(environment.databasePath).replace(/\\/g, "/")}` });

function credential(scenario) {
  const value = credentials.users.find((item) => item.scenario === scenario);
  if (!value) throw new Error(`Missing synthetic ${scenario} credential.`);
  return value;
}

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function session(browser, viewport, scenario = "PACKER") {
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
  let packNavLinks = 0;
  let legacyNavLinks = 0;
  let currentPages = 0;
  if (width < 1280) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await nav.waitFor();
    packNavLinks = await nav.locator('a[href="/work/pack"]').count();
    legacyNavLinks = await nav.locator('a[href="/packing"],a[href="/work/consignments/pack"]').count();
    currentPages = await nav.locator('[aria-current="page"]').count();
    await page.getByRole("button", { name: "Close navigation" }).click();
  } else {
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.locator('a[href="/work/pack"][aria-current="page"]').waitFor({ timeout: 5_000 }).catch(() => null);
    packNavLinks = await nav.locator('a[href="/work/pack"]').count();
    legacyNavLinks = await nav.locator('a[href="/packing"],a[href="/work/consignments/pack"]').count();
    currentPages = await nav.locator('[aria-current="page"]').count();
  }
  const result = await page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled; };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44),
      rawRouteCodes: (document.body.innerText.match(/PICK_(?:MARK_)?(?:ASSEMBLE_)?PACK/g) ?? []),
      text: document.body.innerText,
    };
  });
  return { ...result, packNavLinks, legacyNavLinks, currentPages };
}

const noErrors = (errors) => Object.values(errors).every((items) => items.length === 0);
const healthy = (inspection, errors) => inspection.clientWidth === inspection.scrollWidth && inspection.undersized.length === 0 && inspection.rawRouteCodes.length === 0 && inspection.packNavLinks === 1 && inspection.legacyNavLinks === 0 && inspection.currentPages === 1 && noErrors(errors);
const viewports = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
const results = [];
const key = (viewport) => `${viewport.width}x${viewport.height}`;

async function openPack(page, source) {
  const response = page.waitForResponse((item) => new URL(item.url()).pathname === "/api/work/live" && item.status() === 200, { timeout: 20_000 }).catch(() => null);
  await page.goto(`${base}/work/pack?source=${source}`, { waitUntil: "domcontentloaded" });
  await response;
}

async function detailsCheck(page, packageReference, screenshotPath) {
  const card = page.locator("[data-responsive-work-card]", { hasText: packageReference }).first();
  await card.getByRole("button", { name: "Details" }).click();
  const overlay = page.locator('[data-worker-overlay="DETAILS"] [role="dialog"]');
  await overlay.waitFor();
  await overlay.getByText(/Underlying order items/).waitFor({ timeout: 20_000 });
  const text = await overlay.innerText();
  const bounds = await overlay.boundingBox();
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.keyboard.press("Escape");
  const returned = await card.getByRole("button", { name: "Details" }).evaluate((element) => document.activeElement === element);
  return { text, bounds, returned };
}

async function sourceCount(page, source) {
  const text = await page.locator(`[data-pack-source-selector] a[href*="source=${source}"]`).innerText();
  const match = text.match(/(\d+) open (?:packages|lines)/);
  if (!match) throw new Error(`Could not parse ${source} source count from ${text}`);
  return Number(match[1]);
}

async function waitRemoved(page, text) {
  await page.locator("[data-responsive-work-card]", { hasText: text }).waitFor({ state: "detached", timeout: 12_000 });
}

async function groupedComplete(page, source, text) {
  await openPack(page, source);
  const card = page.locator("[data-responsive-work-card]", { hasText: text }).first();
  await card.waitFor();
  await Promise.all([page.waitForURL((url) => url.pathname === "/work/pack" && url.searchParams.has("success"), { timeout: 20_000 }), card.getByRole("button", { name: "Pack Completed" }).click()]);
}

async function scannerComplete(page, source, code) {
  await page.goto(`${base}/work/scan`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-universal-scan-input]").fill(code);
  await page.locator('select[name="intent"]').selectOption("PACK");
  await page.locator('select[name="source"]').selectOption(source === "ORDER" ? "CUSTOMER_ORDERS" : "CONSIGNMENTS");
  await Promise.all([page.waitForURL((url) => url.searchParams.get("q") === code, { timeout: 20_000 }), page.getByRole("button", { name: "Find work" }).click()]);
  const candidate = page.locator("[data-scanner-candidate]", { hasText: code }).first();
  await candidate.waitFor();
  await Promise.all([page.waitForURL((url) => url.searchParams.has("scanSuccess"), { timeout: 20_000 }), candidate.getByRole("button", { name: "Pack Completed" }).click()]);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
try {
  for (const viewport of viewports) {
    const packer = await session(browser, viewport);
    await openPack(packer.page, "ORDER");
    const order = await inspect(packer.page, viewport.width);
    const orderText = order.text.toLowerCase();
    results.push({ state: "ORDER_PACKAGE_WORKSPACE", viewport: key(viewport), pass: orderText.includes("packing") && orderText.includes("package-c5-mixed-routes") && orderText.includes("contents 3 order items") && orderText.includes("6 units") && orderText.includes("package readiness") && orderText.includes("complete where required") && orderText.includes("pack completed") && orderText.includes("packing assignment conflict") && !orderText.includes("partial quantity") && healthy(order, packer.errors), inspection: order, errors: structuredClone(packer.errors) });

    await openPack(packer.page, "CONSIGNMENT");
    const consignment = await inspect(packer.page, viewport.width);
    const consignmentText = consignment.text.toLowerCase();
    results.push({ state: "CONSIGNMENT_PACK_WORKSPACE", viewport: key(viewport), pass: consignmentText.includes("c5 grouped consignment pack") && consignmentText.includes("line readiness") && consignmentText.includes("pack completed") && !consignmentText.includes("change process flow") && healthy(consignment, packer.errors), inspection: consignment, errors: structuredClone(packer.errors) });

    if (viewport.width === 390) {
      await openPack(packer.page, "ORDER");
      const details = await detailsCheck(packer.page, "PACKAGE-C5-MIXED-ROUTES", path.join(ownerReview, "390-order-package-details.png"));
      const detailsText = details.text.toLowerCase();
      results.push({ state: "PACKAGE_DETAILS_AND_FOCUS", viewport: key(viewport), pass: detailsText.includes("package readiness") && detailsText.includes("underlying order items (3)") && detailsText.includes("stage-c5-package-sku-a") && detailsText.includes("stage-c5-package-sku-c") && details.returned && details.bounds?.height <= viewport.height * 0.94, details });
      await packer.page.screenshot({ path: path.join(ownerReview, "390-order-mixed-package.png"), fullPage: true });
      await openPack(packer.page, "CONSIGNMENT");
      await packer.page.screenshot({ path: path.join(ownerReview, "390-consignment-pack.png"), fullPage: true });
    }
    if (viewport.width === 1440) {
      await openPack(packer.page, "ORDER");
      await packer.page.screenshot({ path: path.join(ownerReview, "1440-order-mixed-package.png"), fullPage: true });
      const details = await detailsCheck(packer.page, "PACKAGE-C5-MIXED-ROUTES", path.join(ownerReview, "1440-order-package-details.png"));
      results.push({ state: "DESKTOP_PACKAGE_DETAILS", viewport: key(viewport), pass: details.text.toLowerCase().includes("underlying order items (3)") && details.returned });
    }
    await packer.context.close();
  }

  const readOnly = await session(browser, { width: 390, height: 844 }, "VIEW_ALL");
  await openPack(readOnly.page, "ORDER");
  const readOnlyText = await readOnly.page.locator("body").innerText();
  results.push({ state: "READ_ONLY_ROLE", viewport: "390x844", pass: readOnlyText.includes("Read-only Pack view") && !readOnlyText.includes("Pack Completed") && noErrors(readOnly.errors), errors: readOnly.errors });
  await readOnly.context.close();

  const denied = await session(browser, { width: 390, height: 844 }, "PICKER");
  await denied.page.goto(`${base}/work/pack`, { waitUntil: "domcontentloaded" });
  const deniedText = await denied.page.locator("body").innerText();
  results.push({ state: "NO_PACK_PERMISSION", viewport: "390x844", pass: new URL(denied.page.url()).pathname !== "/work/pack" && !deniedText.includes("Pack Completed") && noErrors(denied.errors), errors: denied.errors });
  await denied.context.close();

  const reflow = await session(browser, { width: 390, height: 844 });
  await openPack(reflow.page, "ORDER");
  await reflow.page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const orderReflow = await inspect(reflow.page, 390);
  await openPack(reflow.page, "CONSIGNMENT");
  await reflow.page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const consignmentReflow = await inspect(reflow.page, 390);
  results.push({ state: "TWO_HUNDRED_PERCENT_REFLOW", viewport: "390x844", pass: orderReflow.clientWidth === orderReflow.scrollWidth && consignmentReflow.clientWidth === consignmentReflow.scrollWidth && orderReflow.undersized.length === 0 && consignmentReflow.undersized.length === 0, order: orderReflow, consignment: consignmentReflow, errors: reflow.errors });
  await reflow.context.close();

  const groupedOrigin = await session(browser, { width: 390, height: 844 });
  const groupedActor = await session(browser, { width: 390, height: 844 });
  await openPack(groupedOrigin.page, "ORDER");
  const beforeOrder = await sourceCount(groupedOrigin.page, "ORDER");
  await groupedComplete(groupedActor.page, "ORDER", "PACKAGE-C5-MIXED-ROUTES");
  await waitRemoved(groupedOrigin.page, "PACKAGE-C5-MIXED-ROUTES");
  const afterOrder = await sourceCount(groupedOrigin.page, "ORDER");
  const packedOrders = await db.order.findMany({ where: { trackingId: "PACKAGE-C5-MIXED-ROUTES-LONG-REFERENCE-0000000000000001" } });
  const packageTasks = await db.workTask.findMany({ where: { orderId: { in: packedOrders.map((order) => order.id) } } });
  results.push({ state: "GROUPED_ORDER_LIVE_COMPLETION", viewport: "390x844", pass: packedOrders.length === 3 && packedOrders.every((order) => order.packStatus === "PACKED") && packageTasks.filter((task) => task.stage === "PACK").every((task) => task.status === "COMPLETED" && JSON.parse(task.routeSnapshotJson ?? "{}").completedStages.includes("PACK")) && afterOrder === beforeOrder - 1 && noErrors(groupedOrigin.errors) && noErrors(groupedActor.errors) });

  await openPack(groupedOrigin.page, "CONSIGNMENT");
  const beforeConsignment = await sourceCount(groupedOrigin.page, "CONSIGNMENT");
  await groupedComplete(groupedActor.page, "CONSIGNMENT", "C5 grouped Consignment Pack");
  await waitRemoved(groupedOrigin.page, "C5 grouped Consignment Pack");
  const afterConsignment = await sourceCount(groupedOrigin.page, "CONSIGNMENT");
  const groupedLine = await db.consignmentLine.findUniqueOrThrow({ where: { id: "stage4-c5-consignment-grouped" } });
  results.push({ state: "GROUPED_CONSIGNMENT_LIVE_COMPLETION", viewport: "390x844", pass: groupedLine.completedAt instanceof Date && afterConsignment === beforeConsignment - 1 && noErrors(groupedOrigin.errors) && noErrors(groupedActor.errors) });
  await groupedOrigin.context.close();
  await groupedActor.context.close();

  const scannerOrigin = await session(browser, { width: 390, height: 844 });
  const scannerActor = await session(browser, { width: 390, height: 844 });
  await openPack(scannerOrigin.page, "ORDER");
  await scannerComplete(scannerActor.page, "ORDER", "STAGE-C5-ORDER-SCANNER");
  await waitRemoved(scannerOrigin.page, "PACKAGE-C5-SCANNER");
  const scannerOrder = await db.order.findUniqueOrThrow({ where: { id: "stage4-c5-order-scanner" } });
  results.push({ state: "SCANNER_ORDER_LIVE_COMPLETION", viewport: "390x844", pass: scannerOrder.packStatus === "PACKED" && noErrors(scannerOrigin.errors) && noErrors(scannerActor.errors) });

  await openPack(scannerOrigin.page, "CONSIGNMENT");
  await scannerComplete(scannerActor.page, "CONSIGNMENT", "STAGE-C5-CONSIGNMENT-SCANNER");
  await waitRemoved(scannerOrigin.page, "C5 scanner Consignment Pack");
  const scannerLine = await db.consignmentLine.findUniqueOrThrow({ where: { id: "stage4-c5-consignment-scanner" } });
  const batch = await db.consignmentBatch.findUniqueOrThrow({ where: { id: "stage4-c5-consignment-batch" } });
  results.push({ state: "SCANNER_CONSIGNMENT_LIVE_COMPLETION", viewport: "390x844", pass: scannerLine.completedAt instanceof Date && batch.status === "COMPLETED" && noErrors(scannerOrigin.errors) && noErrors(scannerActor.errors) });
  await scannerOrigin.context.close();
  await scannerActor.context.close();
} finally {
  await browser.close();
  await db.$disconnect();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C5PackBrowserV1", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", sourceSha: environment.sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), buildId }, null, 2));
if (failures.length) process.exitCode = 1;
