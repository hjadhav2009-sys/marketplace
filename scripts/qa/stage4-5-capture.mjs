import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, statfs } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { CAPTURE_RUNNER_VERSION, REQUIRED_SCENARIOS, ROLE_TO_DISPLAY, SCENARIO_VERSION, VIEWPORTS } from "./stage4-5-scenarios.mjs";
import { writeSafeCheckpoint } from "./atlas-safe-checkpoint.mjs";
import { evaluateSemanticContract, semanticPreflight } from "./stage4-6c-semantic-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "http://127.0.0.1:3188";
const RUNTIME_SHA = process.env.ATLAS_RUNTIME_SHA
  ?? process.env.ATLAS_SOURCE_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const RUNNER_SHA = process.env.ATLAS_RUNNER_SHA
  ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const BRANCH = process.env.ATLAS_BRANCH
  ?? execFileSync("git", ["branch", "--show-current"], { cwd: ROOT, encoding: "utf8" }).trim();
const BUILD_ID_PATH = path.join(ROOT, ".next", "BUILD_ID");
if (!existsSync(BUILD_ID_PATH)) throw new Error("A production build is required before Stage 4.5 capture.");
const BUILD_ID = (await readFile(BUILD_ID_PATH, "utf8")).trim();
if (process.env.ATLAS_RUNTIME_BUILD_ID && process.env.ATLAS_RUNTIME_BUILD_ID !== BUILD_ID) {
  throw new Error("Capture runtime BUILD_ID does not match the explicit frozen runtime.");
}
const PRIVATE_ROOT = path.join(ROOT, ".codex-tmp", "ui-state-atlas", "current", RUNTIME_SHA);
const CREDENTIALS = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const STAGING_DATABASE = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "database", "staging.db");
const STAGING_FIXTURES = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "fixtures");
const PROGRESS_PATH = path.join(PRIVATE_ROOT, "progress.json");
const RESULT_PATH = path.join(PRIVATE_ROOT, "browser-results.json");
const SEMANTIC_PREFLIGHT_PATH = path.join(ROOT, ".codex-tmp", "stage4-6c1", "semantic-preflight.json");
const MASTER_ROOT = path.join(PRIVATE_ROOT, "full-page");
const TRACE_ROOT = path.join(PRIVATE_ROOT, "traces");
const STOP_PATH = path.join(PRIVATE_ROOT, "stop-after-current");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function options(argv) {
  const result = { headed: false, resume: false, force: false, verifyOnly: false, semanticOnly: false, workers: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--headed") result.headed = true;
    else if (value === "--headless") result.headed = false;
    else if (value === "--resume") result.resume = true;
    else if (value === "--force") result.force = true;
    else if (value === "--verify-only") result.verifyOnly = true;
    else if (value === "--semantic-only") result.semanticOnly = true;
    else if (["--route", "--state", "--states", "--viewport", "--viewports", "--workers"].includes(value)) {
      const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      result[key] = argv[++i];
    }
  }
  result.workers = Math.max(1, Math.min(4, Number(result.workers) || 1));
  return result;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function slug(value) {
  return value.replace(/^\/+/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "root";
}

async function walk(directory) {
  const entries = await readdir(directory);
  const output = [];
  for (const name of entries) {
    const absolute = path.join(directory, name);
    if ((await stat(absolute)).isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

const DYNAMIC_EXAMPLES = {
  "/__qa/design-lab/[area]": "/__qa/design-lab/work-cards",
  "/%5F%5Fqa/design-lab": "/__qa/design-lab",
  "/%5F%5Fqa/design-lab/[area]": "/__qa/design-lab/work-cards",
  "/%5F%5Fqa/ui-audit": "/__qa/ui-audit",
  "/owner/catalog/missing/[issueId]": "/owner/catalog/missing/stage4-missing-listing-issue",
  "/owner/consignments/[batchId]/issues": "/owner/consignments/stage3-batch-review_required/issues",
  "/owner/consignments/[batchId]/listing/[lineId]": "/owner/consignments/stage3-batch-review_required/listing/stage3-line-held-missing",
  "/owner/consignments/[batchId]/review": "/owner/consignments/stage3-batch-review_required/review",
  "/owner/consignments/[batchId]": "/owner/consignments/stage3-batch-active",
  "/owner/imports/[jobId]/issues": "/owner/imports/stage4-import-warnings/issues",
  "/owner/imports/[jobId]/mapping": "/owner/imports/stage4-import-mapping/mapping",
  "/owner/imports/[jobId]": "/owner/imports/stage4-import-completed",
  "/owner/marking-library/[assetId]": "/owner/marking-library/stage4-synthetic-marking-asset",
  "/owner/product-inventory/[listingId]/edit": "/owner/product-inventory/stage3-listing-fk-direct/edit",
  "/owner/product-inventory/[listingId]": "/owner/product-inventory/stage3-listing-fk-direct",
  "/owner/uploads/[batchId]/review": "/owner/uploads/stage4-upload-needs-mapping/review",
  "/packing/[awb]": "/packing/STAGE-AWB-9",
  "/picker/[sku]": "/picker/STAGE-FK-SKU-001",
  "/work/consignments/items/[taskId]": "/work/consignments/items/stage3-line-pick_pack-pack",
  "/work/groups/[stage]/[groupKey]": "/work/pick",
  "/work/marking/[taskId]": "/work/marking/stage3-line-pick_mark_pack-mark",
};

async function sourceRouteScenarios() {
  const appRoot = path.join(ROOT, "app");
  const files = (await walk(appRoot)).filter((file) => path.basename(file) === "page.tsx");
  return files.map((file) => {
    const relative = path.relative(appRoot, file).replaceAll(path.sep, "/").replace(/\/?page\.tsx$/, "");
    const pattern = relative ? `/${relative}` : "/";
    const route = DYNAMIC_EXAMPLES[pattern] ?? pattern;
    const publicRoute = ["/","/login","/forgot-password","/setup","/network-blocked"].includes(pattern);
    return { id:`ROUTE_${pattern.replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").toUpperCase()||"ROOT"}`,route,role:publicRoute?"PUBLIC":"OWNER",routePattern:pattern };
  });
}

async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
}

async function writeJsonCheckpoint(file, value) {
  await writeSafeCheckpoint(file, value);
}

async function login(page, credential) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(credential.username);
  await page.locator('input[name="password"]').fill(credential.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit()),
  ]);
}

async function selectedAccountFromContext(context, credential, scenarioId) {
  if (["AUTH_INVALID", "AUTH_EXPIRED"].includes(scenarioId)) return null;
  const selected = (await context.cookies(BASE)).find((cookie) => cookie.name === "mpp_account")?.value ?? null;
  if (selected === "stage3-account-fk-01") return "STAGE-FK-01";
  if (selected === "stage3-account-amz-01") return "STAGE-AMZ-01";
  return credential?.assignedAccount ?? null;
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll("a[href],button,input,select,textarea,summary,[role=button],[role=tab]")]
      .filter(visible)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const form = element.closest("form");
        return {
          index,
          tag: element.tagName,
          type: element.getAttribute("type") ?? "",
          label: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || element.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 180),
          href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
          disabled: "disabled" in element ? Boolean(element.disabled) : element.getAttribute("aria-disabled") === "true",
          formAction: form?.getAttribute("action") ?? null,
          operational: element.tagName === "BUTTON"
            || element.tagName === "SUMMARY"
            || element.getAttribute("role") === "button"
            || element.getAttribute("role") === "tab"
            || Boolean(element.closest("nav,header,aside,[data-data-action-details]"))
            || (element.tagName === "A" && /\b(inline-flex|rounded)/.test(element.getAttribute("class") ?? "")),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const root = document.documentElement;
    const body = document.body;
    return {
      url: location.pathname + location.search,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      controls,
      overflow: Math.max(root.scrollWidth, body?.scrollWidth ?? 0) > root.clientWidth + 2,
      scrollWidth: Math.max(root.scrollWidth, body?.scrollWidth ?? 0),
      clientWidth: root.clientWidth,
      documentHeight: Math.max(root.scrollHeight, body?.scrollHeight ?? 0),
      undersized: controls.filter((control) => control.operational && (control.width < 44 || control.height < 44)),
      stagingBanner: body?.innerText.includes("PRIVATE SYNTHETIC STAGING") ?? false,
      bodyText: (body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 100_000),
    };
  });
}

async function inspectStable(page) {
  try {
    return await inspect(page);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    await page.waitForTimeout(250);
    return inspect(page);
  }
}

async function settleForAssertions(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(200);
}

function deviceScaleFactor() {
  // Stage 4.2C owner decision: retain lossless full-page PNG evidence at a
  // practical high-density 2x scale. Existing verified 3x/4x masters remain
  // untouched; only missing or explicitly recaptured states use this setting.
  return 2;
}

async function settleFullPage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const limit = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    for (let y = 0; y < limit; y += Math.max(300, Math.floor(innerHeight * .7))) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
    scrollTo(0, limit);
    await new Promise((resolve) => setTimeout(resolve, 250));
    scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 180));
    for (const animation of document.getAnimations()) animation.pause();
  });
}

async function verifyPng(file, expectedWidth, expectedDocumentHeight, scale) {
  const bytes = await readFile(file);
  const image = sharp(bytes, { limitInputPixels: false });
  const [metadata, statistics] = await Promise.all([image.metadata(), image.stats()]);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const expectedHeight = Math.max(1, expectedDocumentHeight) * scale;
  const entropy = statistics.entropy;
  const valid = metadata.format === "png" && width >= expectedWidth && height >= Math.min(expectedHeight, scale * 500) && bytes.length > 10_000 && entropy > .05;
  return { valid, width, height, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), entropy };
}

async function applyScenarioState(page, context, scenarioId, { credential } = {}) {
  if (scenarioId === "AUTH_INVALID") {
    await page.locator('input[name="username"]').fill("synthetic-invalid-user");
    await page.locator('input[name="password"]').fill("synthetic-invalid-password");
    await page.locator("form").first().evaluate((form) => form.requestSubmit());
    await page.waitForTimeout(500);
    return;
  }
  if (["PICK_ROUTE_DIALOG","PICK_ROUTE_OVERRIDE","PICK_MISSING_INSTRUCTIONS"].includes(scenarioId)) {
    const trigger = page.getByRole("button", { name: /Picked All|choose route/i }).first();
    if (await trigger.count()) {
      await trigger.click();
      await page.waitForTimeout(150);
      if (scenarioId !== "PICK_ROUTE_DIALOG") {
        const option = page.getByRole("button", { name: scenarioId === "PICK_ROUTE_OVERRIDE" ? /Assembly/i : /Marking/i }).first();
        if (await option.count()) await option.click();
      }
    }
  }
  if (scenarioId === "IMPORT_ONE_FILE") {
    await page.locator('input[name="files"]').setInputFiles(path.join(STAGING_FIXTURES, "catalog-one.csv"));
  }
  if (scenarioId === "IMPORT_MULTI_FILE") {
    await page.locator('input[name="files"]').setInputFiles([
      path.join(STAGING_FIXTURES, "catalog-one.csv"),
      path.join(STAGING_FIXTURES, "catalog-two.csv"),
    ]);
  }
  if (scenarioId === "IMPORT_AMAZON_THREE_ROLE") {
    await page.locator('input[name="files"]').setInputFiles([
      path.join(STAGING_FIXTURES, "amazon-all-listings.csv"),
      path.join(STAGING_FIXTURES, "catalog-one.csv"),
      path.join(STAGING_FIXTURES, "catalog-two.csv"),
    ]);
  }
  if (scenarioId === "DATA_EXPIRED_GRANT") {
    await page.getByText("Purge QA operational data", { exact: true }).first().click();
  }
  if (scenarioId === "DATA_CONFIRMATION_MISMATCH") {
    const details = page.locator("details[data-data-action-details]").filter({ hasText: "Quarantine image cache" }).first();
    await details.locator("summary").click();
    if (!credential?.password) throw new Error("Synthetic owner credential is required for the confirmation-mismatch preflight.");
    await details.locator('input[name="ownerPassword"]').fill(credential.password);
    await details.locator('input[name="confirmationPhrase"]').fill("SYNTHETIC MISMATCH - DO NOT DELETE");
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/owner/data-management" && url.searchParams.has("error"), { timeout: 15_000 }),
      details.locator("form").evaluate((form) => form.requestSubmit()),
    ]);
  }
}

async function assertScenarioTruth(page, scenarioId) {
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const requires = (...patterns) => {
    for (const pattern of patterns) {
      if (!pattern.test(text)) throw new Error(`${scenarioId} did not prove required state: ${pattern}`);
    }
  };
  if (scenarioId === "OWNER_EMPTY_ACCOUNT") requires(/No seller accounts have been created yet/i, /Create First Seller Account/i);
  if (scenarioId === "MARK_COMPLETED") requires(/MARK:\s*COMPLETED/i, /completed by Synthetic Marker/i);
  if (scenarioId === "ASSEMBLY_READY") {
    requires(/Synthetic assembly-ready order/i, /ASSEMBLE/i, /\bREADY\b/i, /Pending quantity\s*1/i);
  }
  if (scenarioId === "ASSEMBLY_PARTIAL") {
    requires(/Synthetic assembly-progress order/i, /IN PROGRESS/i, /Required quantity\s*2/i, /Completed quantity\s*1/i, /Pending quantity\s*1/i);
  }
  if (scenarioId === "ASSEMBLY_COMPLETED") requires(/ASSEMBLE:\s*COMPLETED/i, /completed by Synthetic Assembler/i);
  if (scenarioId === "AUTH_EXPIRED") {
    requires(/Your session expired\. Sign in again to continue\./i);
    if (!page.url().includes("/login") || !new URL(page.url()).searchParams.has("expired")) throw new Error("AUTH_EXPIRED did not reach the safe expired-session login route.");
  }
  if (scenarioId === "AUTH_FORBIDDEN" || scenarioId === "DATA_REPLAY_REJECTED") {
    requires(/You do not have permission to open this page/i);
    if (new URL(page.url()).pathname !== "/access-denied") throw new Error(`${scenarioId} did not reach /access-denied.`);
  }
  if (scenarioId === "CONSIGNMENT_REVIEW") {
    requires(/Activation blocked/i, /blocking errors/i, /Review blocking issues/i);
    const enabledActivation = page.getByRole("button", { name: /^(Activate|Activate with warnings)$/i }).filter({ hasNot: page.locator("[disabled]") });
    if (await enabledActivation.count()) throw new Error("CONSIGNMENT_REVIEW exposed an enabled activation action.");
  }
  if (scenarioId === "CONSIGNMENT_INVALID_QUANTITY") requires(/\bERROR\b/i, /INVALID QUANTITY/i, /Correct or replace the source/i);
  if (scenarioId === "PACK_ASSEMBLY_LOCKED") {
    requires(/Assembly is required before packing/i);
    if (await page.getByRole("button", { name: /^Confirm packed$/i }).count()) throw new Error("PACK_ASSEMBLY_LOCKED exposed Confirm packed.");
  }
  if (scenarioId === "SCANNER_COMPLETED") requires(/\bPACKED\b/i, /Packing is complete\. This result is read-only/i, /Scan Next/i);
  if (scenarioId === "PROBLEM_OPEN") requires(/Synthetic damaged item/i, /Synthetic open problem for UI audit/i);
  if (scenarioId === "PROBLEM_RESOLVED") requires(/Synthetic assembly mismatch/i, /Synthetic resolution completed/i);
  if (scenarioId === "IMPORT_ONE_FILE") {
    const count = await page.locator('input[name="files"]').evaluate((input) => input.files?.length ?? 0);
    if (count !== 1) throw new Error("IMPORT_ONE_FILE did not retain exactly one selected synthetic file.");
  }
  if (scenarioId === "IMPORT_MULTI_FILE" || scenarioId === "IMPORT_AMAZON_THREE_ROLE") {
    const expected = scenarioId === "IMPORT_MULTI_FILE" ? 2 : 3;
    const count = await page.locator('input[name="files"]').evaluate((input) => input.files?.length ?? 0);
    if (count !== expected) throw new Error(`${scenarioId} did not retain ${expected} selected synthetic files.`);
  }
  if (scenarioId === "PRODUCT_IMAGES_OK") {
    await page.locator("[data-work-gallery] img").first().waitFor({ state: "visible", timeout: 5_000 });
  }
}

function temporarilyDeactivateSyntheticAccounts() {
  const database = new DatabaseSync(STAGING_DATABASE);
  try {
    const rows = database.prepare("SELECT id, active FROM Account").all();
    database.exec("BEGIN IMMEDIATE");
    database.prepare("UPDATE Account SET active = 0").run();
    database.exec("COMMIT");
    return rows;
  } finally {
    database.close();
  }
}

function restoreSyntheticAccounts(rows) {
  const database = new DatabaseSync(STAGING_DATABASE);
  try {
    database.exec("BEGIN IMMEDIATE");
    const statement = database.prepare("UPDATE Account SET active = ? WHERE id = ?");
    for (const row of rows) statement.run(row.active, row.id);
    database.exec("COMMIT");
  } finally {
    database.close();
  }
}

const cli = options(process.argv.slice(2));
await mkdir(MASTER_ROOT, { recursive: true });
await mkdir(TRACE_ROOT, { recursive: true });
if (!existsSync(CREDENTIALS)) throw new Error("Synthetic staging credentials are missing.");
const credentialFile = JSON.parse(await readFile(CREDENTIALS, "utf8"));
const credentials = new Map(credentialFile.users.map((entry) => [entry.displayRole, entry]));
const semantic = await semanticPreflight(ROOT, {
  credentialRoles: [...credentials.keys()],
  accountCodes: ["STAGE-FK-01", "STAGE-AMZ-01"],
});
if (!semantic.passed) throw new Error(`Atlas semantic preflight failed: ${semantic.failures.join(" ")}`);
const executablePath = existsSync(CHROME) ? CHROME : existsSync(EDGE) ? EDGE : undefined;
if (!executablePath) throw new Error("Installed Chrome or Edge is required; no bundled browser was downloaded.");

const scenarioSet = [...REQUIRED_SCENARIOS, ...(!cli.state ? await sourceRouteScenarios() : [])];
const requestedStates = new Set(String(cli.states ?? cli.state ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const requestedViewports = new Set(String(cli.viewports ?? cli.viewport ?? "").split(",").map((value) => value.trim()).filter(Boolean));
let jobs = scenarioSet.flatMap((scenario) => VIEWPORTS
  .filter((viewport) => !requestedViewports.size || requestedViewports.has(viewport.id))
  .map((viewport) => ({ ...scenario, viewport })))
  .filter((job) => !cli.route || job.route.includes(cli.route))
  .filter((job) => !requestedStates.size || requestedStates.has(job.id));

const prior = cli.resume ? await loadJson(PROGRESS_PATH, { completed: {} }) : { completed: {} };
const currentJobKeys = new Set(scenarioSet.flatMap((scenario) => VIEWPORTS.map((viewport) => `${scenario.id}:${viewport.id}`)));
for (const key of Object.keys(prior.completed)) if (!currentJobKeys.has(key)) delete prior.completed[key];
const disk = await statfs(path.dirname(PRIVATE_ROOT));
const totalDiskBytes = Number(disk.blocks) * Number(disk.bsize);
const freeDiskBytes = Number(disk.bavail) * Number(disk.bsize);
if (freeDiskBytes < totalDiskBytes * .25) throw new Error("Full-page capture refused: less than 25% disk space remains.");
const results = [];
const browser = await chromium.launch({ executablePath, headless: !cli.headed, args: ["--disable-extensions", "--disable-sync"] });
try {
  const authStates = new Map();
  for (const role of new Set(jobs.map((job) => job.role).filter((role) => role !== "PUBLIC"))) {
    const credential = credentials.get(ROLE_TO_DISPLAY[role]);
    if (!credential) throw new Error(`Synthetic credential is missing for role ${role}.`);
    const authContext = await browser.newContext();
    const authPage = await authContext.newPage();
    await login(authPage, credential);
    authStates.set(role, await authContext.storageState());
    await authContext.close();
  }
  for (const job of jobs) {
    if (existsSync(STOP_PATH)) {
      console.log(JSON.stringify({ stoppedSafely: true, reason: "stop-after-current flag", nextJob: `${job.id}:${job.viewport.id}` }));
      break;
    }
    const key = `${job.id}:${job.viewport.id}`;
    const priorResult = prior.completed[key];
    const alreadyComplete = priorResult?.fullPageCaptureStatus === "VERIFIED"
      && (priorResult?.runtimeSha ?? priorResult?.commitSha) === RUNTIME_SHA
      && priorResult?.buildId === BUILD_ID
      && priorResult?.scenarioVersion === SCENARIO_VERSION
      && priorResult?.captureRunnerVersion === CAPTURE_RUNNER_VERSION;
    if (cli.resume && !cli.force && alreadyComplete) {
      results.push(prior.completed[key]);
      continue;
    }
    const scale = deviceScaleFactor();
    const context = await browser.newContext({ viewport: { width: job.viewport.width, height: job.viewport.height }, deviceScaleFactor: scale, storageState: authStates.get(job.role) });
    if (job.id === "IMPORT_AMAZON_THREE_ROLE") {
      await context.addCookies([{ name: "mpp_account", value: "stage3-account-amz-01", url: BASE }]);
    }
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const errorResponses = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      consoleErrors.push(`${message.text()}${location.url ? ` @ ${location.url}` : ""}`);
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "failed" }));
    page.on("response", (response) => { if (response.status() >= 400) errorResponses.push({ url: response.url(), status: response.status() }); });
    const masterName = `${job.id}__${slug(job.route)}__${job.viewport.id}__FULL-PAGE@${scale}x.png`;
    const masterRelative = path.posix.join(".codex-tmp", "ui-state-atlas", "current", RUNTIME_SHA, "full-page", masterName);
    const masterPath = path.join(ROOT, ...masterRelative.split("/"));
    const traceRelative = path.posix.join(".codex-tmp", "stage4-2b", "traces", `${job.id}-${job.viewport.id}.zip`);
    const tracePath = path.join(ROOT, ...traceRelative.split("/"));
    const startedAt = new Date().toISOString();
    let status = 0;
    let inspection = null;
    let semanticAssertion = null;
    let error = null;
    let accountRestore = null;
    try {
      if (job.id === "OWNER_EMPTY_ACCOUNT") accountRestore = temporarilyDeactivateSyntheticAccounts();
      if (job.id === "AUTH_EXPIRED") await context.clearCookies();
      const response = await page.goto(`${BASE}${job.route}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForTimeout(350);
      await settleForAssertions(page);
      await applyScenarioState(page, context, job.id, { credential: credentials.get(ROLE_TO_DISPLAY[job.role]) });
      await settleForAssertions(page);
      await assertScenarioTruth(page, job.id);
      status = response?.status() ?? 0;
      inspection = await inspectStable(page);
      const item = semantic.registry.get(job.id);
      const credential = credentials.get(ROLE_TO_DISPLAY[job.role]);
      const actualSelectedAccount = await selectedAccountFromContext(context, credential, job.id);
      semanticAssertion = evaluateSemanticContract(item, {
        bodyText: inspection.bodyText,
        actions: inspection.controls,
        url: inspection.url,
        role: job.role,
        selectedAccount: actualSelectedAccount,
      });
      if (!semanticAssertion.passed) throw new Error(`Semantic assertion failed: ${semanticAssertion.failures.join(", ")}`);
      if (!cli.verifyOnly && !cli.semanticOnly) {
        await settleFullPage(page);
        await page.screenshot({ path: masterPath, type: "png", fullPage: true, animations: "disabled", caret: "hide", scale: "device" });
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    } finally {
      if (accountRestore) restoreSyntheticAccounts(accountRestore);
    }
    const unexpectedFailed = failedRequests.filter((item) => !/example\.invalid|invalid\.example\.invalid/.test(item.url) && item.error !== "net::ERR_ABORTED");
    const unexpectedResponses = errorResponses;
    const smallControls = (inspection?.controls ?? []).filter((control) =>
      control.operational
      && !control.disabled
      && (control.width < 44 || control.height < 44)
    );
    const verified = !error && status > 0 && status < 400 && inspection?.stagingBanner && inspection?.heading !== "404" && !inspection?.overflow && pageErrors.length === 0 && consoleErrors.length === 0 && unexpectedFailed.length === 0 && unexpectedResponses.length === 0 && smallControls.length === 0 && semanticAssertion?.passed === true;
    if (verified) await context.tracing.stop();
    else await context.tracing.stop({ path: tracePath });
    let masterEvidence = null;
    if (!error && !cli.verifyOnly && !cli.semanticOnly) {
      try { masterEvidence = await verifyPng(masterPath, job.viewport.width * scale, inspection?.documentHeight ?? job.viewport.height, scale); }
      catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    }
    const visualStateValid = !error && status > 0 && status < 400 && Boolean(inspection?.stagingBanner) && inspection?.heading !== "404";
    const masterVerified = cli.semanticOnly
      ? false
      : cli.verifyOnly
      ? priorResult?.fullPageCaptureStatus === "VERIFIED"
      : Boolean(masterEvidence?.valid) && visualStateValid;
    const result = {
      ...priorResult,
      branch: BRANCH,
      runtimeSha: RUNTIME_SHA,
      runtimeBuildId: BUILD_ID,
      runnerSha: RUNNER_SHA,
      commitSha: RUNTIME_SHA,
      buildId: BUILD_ID,
      scenarioVersion: SCENARIO_VERSION,
      captureRunnerVersion: CAPTURE_RUNNER_VERSION,
      id: key,
      area: job.id.split("_")[0],
      route: job.route,
      dynamicRouteExample: job.route,
      role: job.role,
      selectedAccount: await selectedAccountFromContext(context, credentials.get(ROLE_TO_DISPLAY[job.role]), job.id),
      scenarioId: job.id,
      stateName: job.id,
      stateCategory: job.id.split("_")[0],
      viewport: job.viewport,
      setupSteps: ["reset canonical synthetic seed when mutation is required", `sign in as ${job.role}`],
      interactionSteps: ["open route", "inventory visible controls", "capture full page"],
      expectedResult: "Synthetic state renders without overflow, unauthorized exposure, console errors or unexpected failed requests.",
      mutatesSyntheticData: false,
      resetStrategy: "canonical synthetic reset",
      evidenceType: "FULL_PAGE",
      fullPageMasterPath: masterRelative,
      fullPageMasterWidth: masterEvidence?.width ?? priorResult?.fullPageMasterWidth ?? null,
      fullPageMasterHeight: masterEvidence?.height ?? priorResult?.fullPageMasterHeight ?? null,
      fullPageDeviceScaleFactor: scale,
      fullPageFileBytes: masterEvidence?.bytes ?? priorResult?.fullPageFileBytes ?? null,
      fullPageSha256: masterEvidence?.sha256 ?? priorResult?.fullPageSha256 ?? null,
      fullPageCaptureStatus: masterVerified ? "VERIFIED" : "FAILED",
      tracePath: verified ? null : traceRelative,
      consoleStatus: consoleErrors.length ? "ERROR" : "CLEAN",
      networkStatus: unexpectedFailed.length ? "ERROR" : "CLEAN",
      controlCount: inspection?.controls.length ?? 0,
      controls: inspection?.controls ?? [],
      status,
      inspection,
      consoleErrors,
      pageErrors,
      failedRequests,
      errorResponses,
      semanticAssertion,
      smallControls,
      error,
      startedAt,
      finishedAt: new Date().toISOString(),
      fingerprint: fingerprint({ job, inspection }),
      auditStatus: cli.semanticOnly
        ? verified ? "SEMANTIC_VERIFIED" : "BROKEN"
        : verified && masterVerified ? "VERIFIED" : "BROKEN",
      notes: verified ? "" : "Inspect private trace and browser evidence.",
    };
    results.push(result);
    if (!cli.semanticOnly) {
      prior.completed[key] = result;
      await writeJsonCheckpoint(PROGRESS_PATH, prior);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const finalResults = cli.semanticOnly
  ? results
  : cli.resume
  ? Object.values(prior.completed).sort((left, right) => left.id.localeCompare(right.id))
  : results;
const summary = {
  generatedAt: new Date().toISOString(),
  browserEngine: executablePath,
  branch: BRANCH,
  runtimeSha: RUNTIME_SHA,
  runtimeBuildId: BUILD_ID,
  runnerSha: RUNNER_SHA,
  commitSha: RUNTIME_SHA,
  buildId: BUILD_ID,
  scenarioVersion: SCENARIO_VERSION,
  captureRunnerVersion: CAPTURE_RUNNER_VERSION,
  requestedJobs: finalResults.length,
  jobsInThisRun: jobs.length,
  verified: finalResults.filter((entry) => entry.auditStatus === "VERIFIED").length,
  semanticVerified: finalResults.filter((entry) => ["VERIFIED", "SEMANTIC_VERIFIED"].includes(entry.auditStatus)).length,
  broken: finalResults.filter((entry) => entry.auditStatus === "BROKEN").length,
  controlCount: finalResults.reduce((sum, entry) => sum + entry.controlCount, 0),
  fullPageMasters: finalResults.filter((entry) => entry.fullPageCaptureStatus === "VERIFIED").length,
  fullPageBytes: finalResults.reduce((sum, entry) => sum + (entry.fullPageFileBytes ?? 0), 0),
  freeDiskBytesAtStart: freeDiskBytes,
  totalDiskBytes,
  failureTraces: finalResults.filter((entry) => entry.tracePath).length,
  viewports: VIEWPORTS,
  syntheticOnly: true,
};
await writeJsonCheckpoint(cli.semanticOnly ? SEMANTIC_PREFLIGHT_PATH : RESULT_PATH, { summary, results: finalResults });
console.log(JSON.stringify(summary, null, 2));
if (cli.semanticOnly && summary.semanticVerified !== jobs.length) process.exitCode = 2;
