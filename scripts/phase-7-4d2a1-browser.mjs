import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { start as startSyntheticStaging, stop as stopSyntheticStaging } from "./staging/core.mjs";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const stage = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const output = path.join(root, ".codex-tmp", "phase-7-4d2a1");
const shots = path.join(output, "owner-review");
const credentials = JSON.parse(await readFile(path.join(stage, "credentials", "synthetic-users.json"), "utf8"));
const environment = JSON.parse(await readFile(path.join(stage, "runtime", "environment.json"), "utf8"));
const buildReceipt = JSON.parse(await readFile(path.join(stage, "reports", "current-build.json"), "utf8"));
const buildId = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;

if (!executablePath) throw new Error("Installed Chrome or Edge is required.");
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("D2A.1 requires private synthetic staging.");
if (buildReceipt.sourceSha !== sourceSha || buildReceipt.buildId !== buildId) throw new Error("D2A.1 requires the exact current production build.");

await mkdir(shots, { recursive: true });
const databaseUrl = `file:${String(environment.databasePath).replace(/\\/g, "/")}`;
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const owner = credentials.users.find((item) => item.scenario === "OWNER");
if (!owner) throw new Error("Synthetic OWNER credentials are unavailable.");

const viewports = [
  { id: "390x844", width: 390, height: 844, suffix: "narrow" },
  { id: "1440x900", width: 1440, height: 900, suffix: "wide" }
];

function fixtureIds(suffix) {
  const prefix = `stage4-d2a1-${suffix}`;
  return {
    prefix,
    account: `${prefix}-account`,
    minimalBatch: `${prefix}-minimal-batch`,
    minimalLine: `${prefix}-minimal-line`,
    fullBatch: `${prefix}-full-batch`,
    fullLine: `${prefix}-full-line`
  };
}

async function createHeldLine(fixture, kind, quantity) {
  const batchId = kind === "minimal" ? fixture.minimalBatch : fixture.fullBatch;
  const lineId = kind === "minimal" ? fixture.minimalLine : fixture.fullLine;
  const sellerSku = `D2A1-${kind.toUpperCase()}-${fixture.prefix}`;
  await db.consignmentBatch.create({ data: {
    id: batchId,
    accountId: fixture.account,
    marketplace: "AMAZON",
    externalConsignmentNumber: `D2A1-${kind}-${fixture.prefix}`,
    displayName: `Synthetic D2A.1 ${kind} ${fixture.prefix}`,
    sourceFileName: `synthetic-${kind}.csv`,
    sourceFileSha256: `${kind}-${fixture.prefix}`.padEnd(64, "a").slice(0, 64),
    status: "REVIEW_REQUIRED",
    totalSourceRows: 1,
    totalValidLines: 1,
    totalRequiredQuantity: quantity,
    unmatchedLines: 1,
    createdByUserId: "stage3-owner"
  } });
  const line = await db.consignmentLine.create({ data: {
    id: lineId,
    consignmentBatchId: batchId,
    accountId: fixture.account,
    rowNumber: 2,
    productNameSource: `Synthetic D2A.1 ${kind} source title`,
    sellerSkuSource: sellerSku,
    asinSource: `D2A1-ASIN-${kind}-${fixture.prefix}`,
    requiredQuantity: quantity,
    matchStatus: "NOT_FOUND"
  } });
  await db.consignmentImportIssue.create({ data: {
    consignmentBatchId: batchId,
    consignmentLineId: lineId,
    rowNumber: 2,
    issueType: "NOT_FOUND",
    severity: "ERROR",
    message: "Synthetic D2A.1 catalog identity is missing."
  } });
  return { batchId, lineId, sellerSku, line };
}

async function resetFixture(viewport) {
  const fixture = fixtureIds(viewport.suffix);
  await db.account.deleteMany({ where: { id: fixture.account } });
  await db.account.create({ data: {
    id: fixture.account,
    name: `Synthetic D2A.1 Amazon ${viewport.suffix}`,
    code: `D2A1-${viewport.suffix.toUpperCase()}`,
    companyName: "Synthetic D2A.1 Warehouse",
    marketplace: "AMAZON",
    accountDisplayName: `Synthetic D2A.1 Amazon ${viewport.suffix}`,
    accountCode: `D2A1-${viewport.suffix.toUpperCase()}`,
    active: true
  } });
  const minimal = await createHeldLine(fixture, "minimal", 5);
  const full = await createHeldLine(fixture, "full", 8);
  return { fixture, minimal, full };
}

function captureErrors(page) {
  const state = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") state.console.push({ url: page.url(), message: message.text() }); });
  page.on("pageerror", (error) => state.page.push({ url: page.url(), message: error.message }));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") state.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) state.responses.push({ url: response.url(), status: response.status() }); });
  return state;
}

const clean = (state) => Object.values(state).every((items) => items.length === 0);
const mergeErrors = (...states) => ({ console: states.flatMap((state) => state.console), page: states.flatMap((state) => state.page), requests: states.flatMap((state) => state.requests), responses: states.flatMap((state) => state.responses) });

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(owner.username);
  await page.locator('input[name="password"]').fill(owner.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit())
  ]);
}

async function selectAccount(page, accountId) {
  await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
  await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]);
}

async function open(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.evaluate(async () => { await document.fonts.ready; for (const animation of document.getAnimations()) animation.pause(); });
  await page.waitForTimeout(500);
}

async function auditedPage(context, route) {
  const page = await context.newPage();
  const errors = captureErrors(page);
  await open(page, route);
  return { page, errors };
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; };
    const controls = [...document.querySelectorAll("#app-shell-main a,#app-shell-main button,#app-shell-main input:not([type=hidden]),#app-shell-main select,#app-shell-main textarea")]
      .filter((element) => visible(element) && !("disabled" in element && element.disabled) && element.getAttribute("aria-disabled") !== "true")
      .map((element) => { const target = (element.matches('input[type="checkbox"],input[type="radio"]') ? element.closest("label") : element) ?? element; const rect = target.getBoundingClientRect(); return { text: (element.textContent || element.getAttribute("aria-label") || "").trim().slice(0, 80), width: rect.width, height: rect.height }; });
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      current: document.querySelectorAll('[aria-current="page"]').length,
      undersized: controls.filter((target) => target.width < 44 || target.height < 44),
      hiddenResolutionActions: document.querySelectorAll('input[type="hidden"][name="resolutionAction"]').length,
      namedResolutionControls: document.querySelectorAll('[name="resolutionAction"]').length,
      text: document.querySelector("#app-shell-main")?.textContent ?? ""
    };
  });
}

function healthy(inspection, errors) {
  return inspection.clientWidth === inspection.scrollWidth && inspection.undersized.length === 0 && inspection.current <= 1 && clean(errors);
}

async function screenshot(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  const file = path.join(shots, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
  return path.relative(root, file);
}

async function submit(page, name, batchId) {
  await Promise.all([
    page.waitForURL(new RegExp(`/owner/consignments/${batchId}/review\\?updated=1`), { timeout: 30_000, waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name, exact: true }).click()
  ]);
  await page.waitForLoadState("load");
}

function authoritativeRefresh(input) {
  const cli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const helper = path.join(root, "scripts", "phase-7-4d2a1-authoritative-refresh.ts");
  return JSON.parse(execFileSync(process.execPath, [cli, helper, JSON.stringify(input)], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8"
  }).trim());
}

async function runViewport(browser, viewport, results) {
  const { fixture, minimal, full } = await resetFixture(viewport);
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const authPage = await context.newPage();
  const authErrors = captureErrors(authPage);
  await login(authPage);
  await selectAccount(authPage, fixture.account);
  await authPage.close();

  const minimalA = await auditedPage(context, `/owner/consignments/${minimal.batchId}/listing/${minimal.lineId}`);
  const minimalB = await auditedPage(context, `/owner/consignments/${minimal.batchId}/listing/${minimal.lineId}`);
  const minimalInspection = await inspect(minimalA.page);
  const sharedRequestId = `d2a1-browser-minimal-${viewport.suffix}`;
  await minimalA.page.locator('input[name="clientRequestId"]').evaluate((input, value) => { input.value = value; }, sharedRequestId);
  await minimalB.page.locator('input[name="clientRequestId"]').evaluate((input, value) => { input.value = value; }, sharedRequestId);
  if (viewport.id === "390x844") await screenshot(minimalA.page, "consignment-minimal-390");
  if (viewport.id === "1440x900") await screenshot(minimalA.page, "consignment-minimal-1440");
  await submit(minimalA.page, "Create minimal listing", minimal.batchId);
  await submit(minimalB.page, "Create minimal listing", minimal.batchId);
  const minimalListing = await db.marketplaceListing.findFirstOrThrow({ where: { accountId: fixture.account, sellerSkuId: minimal.sellerSku } });
  const minimalLine = await db.consignmentLine.findUniqueOrThrow({ where: { id: minimal.lineId } });
  const minimalBatch = await db.consignmentBatch.findUniqueOrThrow({ where: { id: minimal.batchId } });
  const minimalAudit = await db.auditLog.findFirstOrThrow({ where: { accountId: fixture.account, action: "CONSIGNMENT_MISSING_LISTING_RESOLVED", entityId: minimal.lineId } });
  const minimalAttributes = await db.marketplaceListingAttribute.count({ where: { marketplaceListingId: minimalListing.id } });
  const minimalReceipts = await db.workflowActionReceipt.count({ where: { accountId: fixture.account, requestKind: "CONSIGNMENT_MISSING_LISTING_RESOLUTION", clientRequestId: sharedRequestId, status: "COMPLETED" } });
  const minimalErrors = mergeErrors(authErrors, minimalA.errors, minimalB.errors);
  results.push({
    state: "CONSIGNMENT_CREATE_MINIMAL_AND_REPLAY",
    viewport: viewport.id,
    pass: healthy(minimalInspection, minimalErrors)
      && minimalInspection.hiddenResolutionActions === 0
      && minimalInspection.namedResolutionControls === 1
      && JSON.parse(minimalAudit.metadata ?? "{}").action === "CREATE_MINIMAL"
      && minimalListing.productTitle === minimal.line.productNameSource
      && minimalAttributes === 0
      && minimalLine.marketplaceListingId === minimalListing.id
      && minimalLine.requiredQuantity === 5
      && !minimalLine.activated
      && minimalBatch.activatedAt === null
      && await db.workTask.count({ where: { consignmentLineId: minimal.lineId } }) === 0
      && minimalReceipts === 1,
    inspection: minimalInspection,
    database: { action: JSON.parse(minimalAudit.metadata ?? "{}").action, listingId: minimalListing.id, attributes: minimalAttributes, quantity: minimalLine.requiredQuantity, lineActivated: minimalLine.activated, batchActivatedAt: minimalBatch.activatedAt, receipts: minimalReceipts },
    errors: minimalErrors
  });
  await minimalA.page.close();
  await minimalB.page.close();

  const fullPage = await auditedPage(context, `/owner/consignments/${full.batchId}/listing/${full.lineId}`);
  const protectedTitle = `D2A.1 protected title ${viewport.suffix}`;
  await fullPage.page.locator('input[name="productTitle"]').fill(protectedTitle);
  const fullInspection = await inspect(fullPage.page);
  await submit(fullPage.page, "Create full listing", full.batchId);
  const fullListingBefore = await db.marketplaceListing.findFirstOrThrow({ where: { accountId: fixture.account, sellerSkuId: full.sellerSku } });
  const locksBefore = JSON.parse(fullListingBefore.manualLocksJson ?? "{}");
  const provenanceBefore = JSON.parse(fullListingBefore.fieldProvenanceJson ?? "{}");
  const mergeResult = authoritativeRefresh({ accountId: fixture.account, sellerSku: full.sellerSku, sourceFileId: `d2a1-refresh-${viewport.suffix}`, title: `Catalog replacement ${viewport.suffix}`, listingStatus: "ACTIVE" });
  const fullListingAfter = await db.marketplaceListing.findUniqueOrThrow({ where: { id: fullListingBefore.id } });
  const fullLine = await db.consignmentLine.findUniqueOrThrow({ where: { id: full.lineId } });
  const fullErrors = mergeErrors(authErrors, fullPage.errors);
  results.push({
    state: "SYSTEM_DEFAULT_REFRESH_AND_OWNER_TITLE_PROTECTION",
    viewport: viewport.id,
    pass: healthy(fullInspection, fullErrors)
      && fullInspection.hiddenResolutionActions === 0
      && fullListingBefore.listingStatus === "NEEDS_ENRICHMENT"
      && locksBefore.listingStatus === undefined
      && provenanceBefore.listingStatus === undefined
      && locksBefore.productTitle === true
      && fullListingAfter.listingStatus === "ACTIVE"
      && fullListingAfter.productTitle === protectedTitle
      && mergeResult.conflicts.some((item) => item.reason.includes("productTitle"))
      && fullLine.requiredQuantity === 8
      && !fullLine.activated
      && await db.workTask.count({ where: { consignmentLineId: full.lineId } }) === 0,
    inspection: fullInspection,
    database: { listingId: fullListingAfter.id, beforeStatus: fullListingBefore.listingStatus, listingStatusLocked: locksBefore.listingStatus === true, listingStatusProvenance: provenanceBefore.listingStatus ?? null, titleLocked: locksBefore.productTitle === true, afterStatus: fullListingAfter.listingStatus, afterTitle: fullListingAfter.productTitle, quantity: fullLine.requiredQuantity, lineActivated: fullLine.activated, conflicts: mergeResult.conflicts },
    errors: fullErrors
  });
  await fullPage.page.close();
  await context.close();
}

const started = await startSyntheticStaging();
if (started.sourceSha !== sourceSha || started.buildId !== buildId) throw new Error("D2A.1 staging start did not use the exact current build.");
let browser;
const results = [];
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
  for (const viewport of viewports) await runViewport(browser, viewport, results);
} finally {
  if (browser) await browser.close();
  await db.$disconnect();
  await stopSyntheticStaging();
}

const failures = results.filter((result) => !result.pass || !clean(result.errors));
const report = { schema: "Phase7_4D2A1FinalCatalogIntentBrowserV1", environment: environment.environment, browser: executablePath, sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ sourceSha, buildId, records: results.length, failures: failures.length, failed: failures.map((result) => `${result.state}:${result.viewport}`) }, null, 2));
if (failures.length) process.exitCode = 1;
