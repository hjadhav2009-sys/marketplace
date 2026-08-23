import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import { start as startSyntheticStaging, stop as stopSyntheticStaging } from "./staging/core.mjs";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const stage = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const output = path.join(root, ".codex-tmp", "phase-7-4d2a");
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
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) {
  throw new Error("D2A QA requires private synthetic staging.");
}
if (buildReceipt.sourceSha !== sourceSha || buildReceipt.buildId !== buildId) {
  throw new Error("D2A QA requires the exact current production build.");
}

await mkdir(shots, { recursive: true });
const db = new PrismaClient({ datasourceUrl: `file:${String(environment.databasePath).replace(/\\/g, "/")}` });
const owner = credentials.users.find((item) => item.scenario === "OWNER");
if (!owner) throw new Error("Synthetic OWNER credentials are unavailable.");

const viewports = [
  { id: "390x844", width: 390, height: 844, suffix: "narrow" },
  { id: "1440x900", width: 1440, height: 900, suffix: "wide" }
];

function stableRequestId(namespace, ...parts) {
  const fingerprint = createHash("sha256")
    .update(parts.map((part) => part instanceof Date ? part.toISOString() : String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 48);
  return `${namespace}:${fingerprint}`;
}

function ids(suffix) {
  const prefix = `stage4-d2a-${suffix}`;
  return {
    prefix,
    account: `${prefix}-account`,
    profile: `${prefix}-profile`,
    upload: `${prefix}-upload`,
    editListing: `${prefix}-edit-listing`,
    minimalOrder: `${prefix}-minimal-order`,
    minimalIssue: `${prefix}-minimal-issue`,
    fullOrder: `${prefix}-full-order`,
    fullIssue: `${prefix}-full-issue`,
    ambiguousOrder: `${prefix}-ambiguous-order`,
    ambiguousIssue: `${prefix}-ambiguous-issue`,
    candidateA: `${prefix}-candidate-a`,
    candidateB: `${prefix}-candidate-b`
  };
}

function largeAmazonSchema(suffix) {
  const fields = Array.from({ length: 883 }, (_, index) => {
    const position = index + 1;
    return {
      canonicalKey: `amazon.${suffix}.synthetic_field_${position}`,
      originalHeader: `Synthetic Amazon field ${position}`,
      technicalKey: `amazon.${suffix}.synthetic_field_${position}`,
      label: `Synthetic Amazon field ${position}`,
      section: "Category Attributes",
      dataType: "text",
      maxLength: 4000,
      marketplaceRequiredGuidance: false,
      locallyOptional: true,
      dynamicAttributeTarget: `amazon.${suffix}.synthetic_field_${position}`
    };
  });
  return {
    marketplace: "AMAZON",
    templateKind: "SYNTHETIC_D2A_883_FIELD_PROFILE",
    technicalHeaderFingerprint: `d2a-${suffix}-technical-fingerprint`,
    humanHeaderFingerprint: `d2a-${suffix}-human-fingerprint`,
    fields,
    groups: ["Category Attributes"]
  };
}

async function resetFixture(viewport) {
  const fixture = ids(viewport.suffix);
  const schema = largeAmazonSchema(viewport.suffix);
  await db.account.deleteMany({ where: { id: fixture.account } });
  await db.account.create({ data: {
    id: fixture.account,
    name: `Synthetic D2A Amazon ${viewport.suffix}`,
    code: `D2A-${viewport.suffix.toUpperCase()}`,
    companyName: "Synthetic D2A Warehouse",
    marketplace: "AMAZON",
    accountDisplayName: `Synthetic D2A Amazon ${viewport.suffix}`,
    accountCode: `D2A-${viewport.suffix.toUpperCase()}`,
    active: true
  } });
  await db.marketplaceListing.createMany({ data: [
    {
      id: fixture.editListing,
      accountId: fixture.account,
      marketplace: "AMAZON",
      sellerSkuId: `D2A-EDIT-${viewport.suffix}`,
      sku: `D2A-EDIT-${viewport.suffix}`,
      productTitle: `D2A original title ${viewport.suffix}`,
      listingStatus: "ACTIVE",
      generatedDirectProductUrl: `https://example.test/generated/${viewport.suffix}`,
      canonicalProductUrl: `https://example.test/canonical/${viewport.suffix}`
    },
    {
      id: fixture.candidateA,
      accountId: fixture.account,
      marketplace: "AMAZON",
      sellerSkuId: `D2A-CANDIDATE-A-${viewport.suffix}`,
      sku: `D2A-CANDIDATE-A-${viewport.suffix}`,
      productTitle: `D2A ambiguous candidate A ${viewport.suffix}`,
      listingStatus: "ACTIVE"
    },
    {
      id: fixture.candidateB,
      accountId: fixture.account,
      marketplace: "AMAZON",
      sellerSkuId: `D2A-CANDIDATE-B-${viewport.suffix}`,
      sku: `D2A-CANDIDATE-B-${viewport.suffix}`,
      productTitle: `D2A ambiguous candidate B ${viewport.suffix}`,
      listingStatus: "ACTIVE"
    }
  ] });
  await db.marketplaceFileProfile.create({ data: {
    id: fixture.profile,
    accountId: fixture.account,
    marketplace: "AMAZON",
    importPurpose: "PRODUCT_CATALOG",
    profileName: "Synthetic Amazon 883-field profile",
    headerFingerprint: `d2a-${viewport.suffix}-profile-fingerprint`,
    fieldMappingJson: "{}",
    requiredFieldsJson: "[]",
    optionalFieldsJson: "[]",
    formSchemaJson: JSON.stringify(schema),
    technicalHeaderFingerprint: schema.technicalHeaderFingerprint,
    humanHeaderFingerprint: schema.humanHeaderFingerprint,
    templateKind: schema.templateKind,
    fieldGroupsJson: JSON.stringify(schema.groups),
    active: true,
    createdByUserId: "stage3-owner"
  } });
  await db.uploadBatch.create({ data: {
    id: fixture.upload,
    accountId: fixture.account,
    fileName: `synthetic-d2a-${viewport.suffix}.csv`
  } });
  await db.order.createMany({ data: [
    {
      id: fixture.minimalOrder,
      accountId: fixture.account,
      batchId: fixture.upload,
      marketplace: "AMAZON",
      awb: `D2A-MINIMAL-AWB-${viewport.suffix}`,
      sku: `D2A-MINIMAL-SKU-${viewport.suffix}`,
      orderNo: `D2A-MINIMAL-ORDER-${viewport.suffix}`,
      qty: 2,
      productDescription: "Synthetic D2A minimal listing Order"
    },
    {
      id: fixture.fullOrder,
      accountId: fixture.account,
      batchId: fixture.upload,
      marketplace: "AMAZON",
      awb: `D2A-FULL-AWB-${viewport.suffix}`,
      sku: `D2A-FULL-SKU-${viewport.suffix}`,
      orderNo: `D2A-FULL-ORDER-${viewport.suffix}`,
      qty: 3,
      productDescription: "Synthetic D2A full listing Order"
    },
    {
      id: fixture.ambiguousOrder,
      accountId: fixture.account,
      batchId: fixture.upload,
      marketplace: "AMAZON",
      awb: `D2A-AMBIGUOUS-AWB-${viewport.suffix}`,
      sku: `D2A-AMBIGUOUS-SKU-${viewport.suffix}`,
      orderNo: `D2A-AMBIGUOUS-ORDER-${viewport.suffix}`,
      qty: 4,
      productDescription: "Synthetic D2A ambiguous listing Order"
    }
  ] });
  await db.importRowIssue.createMany({ data: [
    {
      id: fixture.minimalIssue,
      batchId: fixture.upload,
      rowNumber: 1,
      issueType: "MISSING_FLIPKART_LISTING_MAPPING",
      message: "Synthetic D2A Order needs a minimal listing.",
      safeDataJson: JSON.stringify({ sellerSku: `D2A-MINIMAL-SKU-${viewport.suffix}` }),
      sourceType: "ORDER",
      sourceId: fixture.minimalOrder,
      createdAt: new Date("2026-08-20T08:15:00.000Z")
    },
    {
      id: fixture.fullIssue,
      batchId: fixture.upload,
      rowNumber: 2,
      issueType: "MISSING_FLIPKART_LISTING_MAPPING",
      message: "Synthetic D2A Order needs a full listing.",
      safeDataJson: JSON.stringify({ sellerSku: `D2A-FULL-SKU-${viewport.suffix}` }),
      sourceType: "ORDER",
      sourceId: fixture.fullOrder,
      createdAt: new Date("2026-08-21T09:30:00.000Z")
    },
    {
      id: fixture.ambiguousIssue,
      batchId: fixture.upload,
      rowNumber: 3,
      issueType: "AMBIGUOUS_LISTING",
      message: "Synthetic D2A Order retained two exact candidates.",
      safeDataJson: JSON.stringify({
        sellerSku: `D2A-AMBIGUOUS-SKU-${viewport.suffix}`,
        listingIds: [fixture.candidateA, fixture.candidateB]
      }),
      sourceType: "ORDER",
      sourceId: fixture.ambiguousOrder,
      createdAt: new Date("2026-08-22T10:45:00.000Z")
    }
  ] });
  return { fixture, schema };
}

function captureErrors(page) {
  const state = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => {
    if (message.type() === "error") state.console.push({ url: page.url(), message: message.text() });
  });
  page.on("pageerror", (error) => state.page.push({ url: page.url(), message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") state.requests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) state.responses.push({ url: response.url(), status: response.status() });
  });
  return state;
}

const clean = (state) => Object.values(state).every((items) => items.length === 0);
const mergeErrors = (...states) => ({
  console: states.flatMap((state) => state.console),
  page: states.flatMap((state) => state.page),
  requests: states.flatMap((state) => state.requests),
  responses: states.flatMap((state) => state.responses)
});

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
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole("button", { name: "Select account" }).click()
  ]);
}

async function open(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const animation of document.getAnimations()) animation.pause();
  });
  await page.waitForTimeout(750);
}

async function newAuditedPage(context, route) {
  const page = await context.newPage();
  const errors = captureErrors(page);
  await open(page, route);
  return { page, errors };
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const controls = [...document.querySelectorAll("#app-shell-main a,#app-shell-main button,#app-shell-main input:not([type=hidden]),#app-shell-main select,#app-shell-main textarea,#app-shell-main summary")]
      .filter((element) => visible(element) && !("disabled" in element && element.disabled) && element.getAttribute("aria-disabled") !== "true")
      .map((element) => {
        const target = (element.matches('input[type="checkbox"],input[type="radio"]') ? element.closest("label") : element) ?? element;
        const rect = target.getBoundingClientRect();
        return { text: (element.textContent || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "").trim().slice(0, 80), width: rect.width, height: rect.height };
      });
    const visibleAdvanced = [...document.querySelectorAll('input[name^="attribute:"]')].filter(visible).length;
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      text: document.querySelector("#app-shell-main")?.textContent ?? "",
      current: document.querySelectorAll('[aria-current="page"]').length,
      undersized: controls.filter((target) => target.width < 44 || target.height < 44),
      visibleAdvanced,
      totalAdvancedInputs: document.querySelectorAll('input[name^="attribute:"]').length
    };
  });
}

function healthy(inspection, errorState) {
  return inspection.clientWidth === inspection.scrollWidth
    && inspection.undersized.length === 0
    && inspection.current <= 1
    && clean(errorState);
}

async function screenshot(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  const file = path.join(shots, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
  return path.relative(root, file);
}

async function submit(page, buttonName, destination) {
  await Promise.all([
    page.waitForURL(destination, { timeout: 30_000, waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: buttonName, exact: true }).click()
  ]);
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
}

async function orderProof(fixture, orderId, sellerSku) {
  const listing = await db.marketplaceListing.findFirstOrThrow({ where: { accountId: fixture.account, sellerSkuId: sellerSku } });
  const tasks = await db.workTask.findMany({ where: { accountId: fixture.account, orderId }, select: { id: true, status: true, requiredQuantity: true, workCardSnapshotJson: true } });
  const projection = tasks[0]
    ? await db.workGroupMember.findUnique({ where: { taskId: tasks[0].id }, include: { projection: true } })
    : null;
  return { listing, tasks, projection };
}

async function prepareFull(page, fixture, suffix, provePagination = false) {
  await open(page, `/owner/catalog/missing/${fixture.fullIssue}?action=full`);
  await page.locator("details").getByText("Advanced marketplace attributes", { exact: false }).click();
  const search = page.locator('input[type="search"][placeholder="Field label or technical key"]');
  if (provePagination) {
    for (let index = 0; index < 17; index += 1) {
      await page.locator("details").getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.locator(`input[name="attribute:amazon.${suffix}.synthetic_field_700"]`).waitFor({ state: "visible" });
  }
  await search.fill("synthetic_field_883");
  const field883 = page.locator(`input[name="attribute:amazon.${suffix}.synthetic_field_883"]`);
  await field883.waitFor({ state: "visible" });
  await field883.fill(`D2A value 883 ${suffix}`);
  await search.fill("synthetic_field_700");
  const field700 = page.locator(`input[name="attribute:amazon.${suffix}.synthetic_field_700"]`);
  await field700.waitFor({ state: "visible" });
  await field700.fill(`D2A value 700 ${suffix}`);
  await search.fill("synthetic_field_883");
  if (await field883.inputValue() !== `D2A value 883 ${suffix}`) throw new Error("Field 883 did not survive search state changes.");
  await search.fill("synthetic_field_700");
  if (await field700.inputValue() !== `D2A value 700 ${suffix}`) throw new Error("Field 700 did not survive search state changes.");
  await page.locator('input[name="productTitle"]').fill(`D2A full listing ${suffix}`);
}

async function runViewport(browser, viewport, results) {
  const { fixture } = await resetFixture(viewport);
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
  const authPage = await context.newPage();
  const authErrors = captureErrors(authPage);
  await login(authPage);
  await selectAccount(authPage, fixture.account);
  await authPage.close();

  const missingAudit = await newAuditedPage(context, "/owner/catalog/missing");
  const missingInspection = await inspect(missingAudit.page);
  if (viewport.id === "390x844") await screenshot(missingAudit.page, "missing-first-seen-390");
  results.push({
    state: "FIRST_SEEN_AND_REASON_TRUTH",
    viewport: viewport.id,
    pass: healthy(missingInspection, mergeErrors(authErrors, missingAudit.errors))
      && missingInspection.text.includes("First seen")
      && missingInspection.text.includes(`D2A-MINIMAL-SKU-${viewport.suffix}`),
    inspection: missingInspection,
    errors: mergeErrors(authErrors, missingAudit.errors)
  });
  await missingAudit.page.close();

  const conflictAudit = await newAuditedPage(context, "/owner/catalog/missing?reason=conflict");
  const conflictInspection = await inspect(conflictAudit.page);
  results.push({
    state: "CONFLICT_FILTER_TRUTH",
    viewport: viewport.id,
    pass: healthy(conflictInspection, mergeErrors(authErrors, conflictAudit.errors))
      && !conflictInspection.text.includes(`D2A-AMBIGUOUS-SKU-${viewport.suffix}`),
    inspection: conflictInspection,
    errors: mergeErrors(authErrors, conflictAudit.errors)
  });
  await conflictAudit.page.close();

  const detailsAudit = await newAuditedPage(context, `/owner/product-inventory/${fixture.editListing}`);
  const detailsInspection = await inspect(detailsAudit.page);
  if (viewport.id === "1440x900") await screenshot(detailsAudit.page, "marketplace-links-1440");
  results.push({
    state: "SAFE_MARKETPLACE_LINKS",
    viewport: viewport.id,
    pass: healthy(detailsInspection, mergeErrors(authErrors, detailsAudit.errors))
      && await detailsAudit.page.locator('a[href^="https://example.test/generated/"]').count() === 1
      && await detailsAudit.page.locator('a[href^="https://example.test/canonical/"]').count() === 1,
    inspection: detailsInspection,
    errors: mergeErrors(authErrors, detailsAudit.errors)
  });
  await detailsAudit.page.close();

  const editAudit = await newAuditedPage(context, `/owner/product-inventory/${fixture.editListing}/edit`);
  const editedTitle = `D2A edited title ${viewport.suffix}`;
  await editAudit.page.locator('input[name="productTitle"]').fill(editedTitle);
  await submit(editAudit.page, "Save listing", new RegExp(`/owner/product-inventory/${fixture.editListing}$`));
  const edited = await db.marketplaceListing.findUniqueOrThrow({ where: { id: fixture.editListing } });
  const editInspection = await inspect(editAudit.page);
  results.push({
    state: "EDIT_LISTING_MUTATION",
    viewport: viewport.id,
    pass: healthy(editInspection, mergeErrors(authErrors, editAudit.errors))
      && edited.productTitle === editedTitle
      && editInspection.text.includes(editedTitle),
    database: { title: edited.productTitle },
    inspection: editInspection,
    errors: mergeErrors(authErrors, editAudit.errors)
  });
  await editAudit.page.close();

  const minimalA = await newAuditedPage(context, `/owner/catalog/missing/${fixture.minimalIssue}?action=minimal`);
  const minimalB = await newAuditedPage(context, `/owner/catalog/missing/${fixture.minimalIssue}?action=minimal`);
  await submit(minimalA.page, "Create minimal listing", /\/owner\/catalog\/missing\?resolved=/);
  await submit(minimalB.page, "Create minimal listing", /\/owner\/catalog\/missing\?resolved=/);
  const minimal = await orderProof(fixture, fixture.minimalOrder, `D2A-MINIMAL-SKU-${viewport.suffix}`);
  const minimalIssue = await db.importRowIssue.findUniqueOrThrow({ where: { id: fixture.minimalIssue } });
  const minimalReceipts = await db.workflowActionReceipt.count({ where: { accountId: fixture.account, requestKind: "MISSING_LISTING_RESOLUTION", clientRequestId: stableRequestId("missing-minimal", fixture.minimalIssue, 1) } });
  const minimalErrors = mergeErrors(authErrors, minimalA.errors, minimalB.errors);
  results.push({
    state: "CREATE_MINIMAL_MUTATION_AND_REPLAY",
    viewport: viewport.id,
    pass: minimalIssue.resolved
      && minimal.tasks.length === 1
      && minimal.tasks[0].requiredQuantity === 2
      && minimal.projection?.projection.requiredQuantity === 2
      && minimalReceipts === 1
      && clean(minimalErrors),
    database: { listingId: minimal.listing.id, issueResolved: minimalIssue.resolved, tasks: minimal.tasks.length, projectionQuantity: minimal.projection?.projection.requiredQuantity, receipts: minimalReceipts },
    errors: minimalErrors
  });
  await minimalA.page.close();
  await minimalB.page.close();

  const fullA = await context.newPage();
  const fullAErrors = captureErrors(fullA);
  const fullB = await context.newPage();
  const fullBErrors = captureErrors(fullB);
  await prepareFull(fullA, fixture, viewport.suffix, true);
  const fullInspection = await inspect(fullA);
  await prepareFull(fullB, fixture, viewport.suffix, false);
  if (viewport.id === "390x844") await screenshot(fullA, "large-profile-field-700-390");
  if (viewport.id === "1440x900") await screenshot(fullA, "large-profile-field-700-1440");
  await submit(fullA, "Create full listing", /\/owner\/catalog\/missing\?resolved=/);
  await submit(fullB, "Create full listing", /\/owner\/catalog\/missing\?resolved=/);
  const full = await orderProof(fixture, fixture.fullOrder, `D2A-FULL-SKU-${viewport.suffix}`);
  const fullIssue = await db.importRowIssue.findUniqueOrThrow({ where: { id: fixture.fullIssue } });
  const storedAttributes = await db.marketplaceListingAttribute.findMany({ where: { marketplaceListingId: full.listing.id }, select: { technicalKey: true, valueText: true } });
  const fullReceipts = await db.workflowActionReceipt.count({ where: { accountId: fixture.account, requestKind: "MISSING_LISTING_RESOLUTION", clientRequestId: stableRequestId("missing-full", fixture.fullIssue, 1) } });
  const fullErrors = mergeErrors(authErrors, fullAErrors, fullBErrors);
  results.push({
    state: "CREATE_FULL_883_FIELD_MUTATION_AND_REPLAY",
    viewport: viewport.id,
    pass: healthy(fullInspection, fullErrors)
      && fullInspection.visibleAdvanced <= 40
      && fullInspection.totalAdvancedInputs < 883
      && fullIssue.resolved
      && full.tasks.length === 1
      && full.tasks[0].requiredQuantity === 3
      && full.projection?.projection.requiredQuantity === 3
      && storedAttributes.some((attribute) => attribute.technicalKey.endsWith("synthetic_field_700") && attribute.valueText === `D2A value 700 ${viewport.suffix}`)
      && storedAttributes.some((attribute) => attribute.technicalKey.endsWith("synthetic_field_883") && attribute.valueText === `D2A value 883 ${viewport.suffix}`)
      && fullReceipts === 1
      && clean(fullErrors),
    database: { listingId: full.listing.id, issueResolved: fullIssue.resolved, tasks: full.tasks.length, projectionQuantity: full.projection?.projection.requiredQuantity, storedAttributes, receipts: fullReceipts },
    inspection: fullInspection,
    errors: fullErrors
  });
  await fullA.close();
  await fullB.close();

  const ambiguousA = await newAuditedPage(context, `/owner/catalog/missing/${fixture.ambiguousIssue}?action=link`);
  const ambiguousB = await newAuditedPage(context, `/owner/catalog/missing/${fixture.ambiguousIssue}?action=link`);
  const chooseB = (page) => page.locator("form").filter({ hasText: `D2A ambiguous candidate B ${viewport.suffix}` }).getByRole("button", { name: "Choose listing", exact: true });
  await Promise.all([
    ambiguousA.page.waitForURL(/\/owner\/catalog\/missing\?resolved=/, { timeout: 30_000, waitUntil: "domcontentloaded" }),
    chooseB(ambiguousA.page).click()
  ]);
  await Promise.all([
    ambiguousB.page.waitForURL(/\/owner\/catalog\/missing\?resolved=/, { timeout: 30_000, waitUntil: "domcontentloaded" }),
    chooseB(ambiguousB.page).click()
  ]);
  const ambiguousIssue = await db.importRowIssue.findUniqueOrThrow({ where: { id: fixture.ambiguousIssue } });
  const ambiguousTasks = await db.workTask.findMany({ where: { orderId: fixture.ambiguousOrder }, select: { id: true, workCardSnapshotJson: true } });
  const ambiguousAudit = await db.auditLog.findMany({ where: { accountId: fixture.account, action: "MISSING_LISTING_RESOLVED", entityId: fixture.ambiguousIssue }, select: { metadata: true } });
  const ambiguousReceipts = await db.workflowActionReceipt.count({ where: { accountId: fixture.account, requestKind: "MISSING_LISTING_RESOLUTION", clientRequestId: stableRequestId("missing-link", fixture.ambiguousIssue, 1, fixture.candidateB) } });
  const ambiguousErrors = mergeErrors(authErrors, ambiguousA.errors, ambiguousB.errors);
  results.push({
    state: "AMBIGUOUS_EXACT_CANDIDATE_MUTATION_AND_REPLAY",
    viewport: viewport.id,
    pass: ambiguousIssue.resolved
      && ambiguousTasks.length === 1
      && JSON.parse(ambiguousTasks[0].workCardSnapshotJson ?? "{}").sellerSku === `D2A-CANDIDATE-B-${viewport.suffix}`
      && ambiguousAudit.length === 1
      && JSON.parse(ambiguousAudit[0].metadata ?? "{}").listingId === fixture.candidateB
      && ambiguousReceipts === 1
      && clean(ambiguousErrors),
    database: { issueResolved: ambiguousIssue.resolved, tasks: ambiguousTasks.length, auditListingId: JSON.parse(ambiguousAudit[0]?.metadata ?? "{}").listingId, receipts: ambiguousReceipts },
    errors: ambiguousErrors
  });
  await ambiguousA.page.close();
  await ambiguousB.page.close();

  await context.close();
}

const started = await startSyntheticStaging();
if (started.sourceSha !== sourceSha || started.buildId !== buildId) throw new Error("D2A staging start did not use the exact current build.");
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
const report = {
  schema: "Phase7_4D2ACatalogFormCompletenessBrowserV1",
  environment: environment.environment,
  browser: executablePath,
  sourceSha,
  buildId,
  records: results.length,
  failures: failures.length,
  results
};
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ sourceSha, buildId, records: results.length, failures: failures.length, failed: failures.map((result) => `${result.state}:${result.viewport}`) }, null, 2));
if (failures.length) process.exitCode = 1;
