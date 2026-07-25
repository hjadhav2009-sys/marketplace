import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { REQUIRED_SCENARIOS, ROLE_TO_DISPLAY, VIEWPORTS } from "./stage4-2b-scenarios.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "http://127.0.0.1:3188";
const PRIVATE_ROOT = path.join(ROOT, ".codex-tmp", "stage4-2b");
const CREDENTIALS = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const PROGRESS_PATH = path.join(PRIVATE_ROOT, "progress.json");
const RESULT_PATH = path.join(PRIVATE_ROOT, "browser-results.json");
const SCREENSHOT_ROOT = path.join(PRIVATE_ROOT, "screenshots");
const MASTER_ROOT = path.join(PRIVATE_ROOT, "full-page-hires");
const TRACE_ROOT = path.join(PRIVATE_ROOT, "traces");
const STOP_PATH = path.join(PRIVATE_ROOT, "stop-after-current");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function options(argv) {
  const result = { headed: false, resume: false, force: false, captureOnly: false, verifyOnly: false, fullPage: false, hires: false, mastersOnly: false, workers: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--headed") result.headed = true;
    else if (value === "--headless") result.headed = false;
    else if (value === "--resume") result.resume = true;
    else if (value === "--force") result.force = true;
    else if (value === "--capture-only") result.captureOnly = true;
    else if (value === "--verify-only") result.verifyOnly = true;
    else if (value === "--full-page") result.fullPage = true;
    else if (value === "--hires") result.hires = true;
    else if (value === "--masters-only") result.mastersOnly = true;
    else if (["--route", "--state", "--viewport", "--workers"].includes(value)) {
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
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
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
      undersized: controls.filter((control) => ["BUTTON", "A", "SUMMARY"].includes(control.tag) && control.height < 40),
      stagingBanner: body?.innerText.includes("PRIVATE SYNTHETIC STAGING") ?? false,
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

async function applyScenarioState(page, context, scenarioId) {
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
}

const cli = options(process.argv.slice(2));
await mkdir(SCREENSHOT_ROOT, { recursive: true });
await mkdir(MASTER_ROOT, { recursive: true });
await mkdir(TRACE_ROOT, { recursive: true });
if (!existsSync(CREDENTIALS)) throw new Error("Synthetic staging credentials are missing.");
const credentialFile = JSON.parse(await readFile(CREDENTIALS, "utf8"));
const credentials = new Map(credentialFile.users.map((entry) => [entry.displayRole, entry]));
const executablePath = existsSync(CHROME) ? CHROME : existsSync(EDGE) ? EDGE : undefined;
if (!executablePath) throw new Error("Installed Chrome or Edge is required; no bundled browser was downloaded.");

const scenarioSet = [...REQUIRED_SCENARIOS, ...(!cli.state ? await sourceRouteScenarios() : [])];
let jobs = scenarioSet.flatMap((scenario) => VIEWPORTS
  .filter((viewport) => !cli.viewport || viewport.id === cli.viewport)
  .map((viewport) => ({ ...scenario, viewport })))
  .filter((job) => !cli.route || job.route.includes(cli.route))
  .filter((job) => !cli.state || job.id === cli.state);

const prior = cli.resume ? await loadJson(PROGRESS_PATH, { completed: {} }) : { completed: {} };
const currentJobKeys = new Set(scenarioSet.flatMap((scenario) => VIEWPORTS.map((viewport) => `${scenario.id}:${viewport.id}`)));
for (const key of Object.keys(prior.completed)) if (!currentJobKeys.has(key)) delete prior.completed[key];
const disk = await statfs(PRIVATE_ROOT);
const totalDiskBytes = Number(disk.blocks) * Number(disk.bsize);
const freeDiskBytes = Number(disk.bavail) * Number(disk.bsize);
if ((cli.hires || cli.mastersOnly) && freeDiskBytes < totalDiskBytes * .25) throw new Error("Full-page capture refused: less than 25% disk space remains.");
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
    const alreadyComplete = cli.mastersOnly
      ? priorResult?.fullPageCaptureStatus === "VERIFIED"
      : priorResult?.viewportCaptureStatus === "VERIFIED";
    if (cli.resume && !cli.force && alreadyComplete) {
      results.push(prior.completed[key]);
      continue;
    }
    const scale = cli.hires || cli.mastersOnly ? deviceScaleFactor() : 1;
    const context = await browser.newContext({ viewport: { width: job.viewport.width, height: job.viewport.height }, deviceScaleFactor: scale, storageState: authStates.get(job.role) });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const errorResponses = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "failed" }));
    page.on("response", (response) => { if (response.status() >= 400) errorResponses.push({ url: response.url(), status: response.status() }); });
    const screenshotRelative = path.posix.join(".codex-tmp", "stage4-2b", "screenshots", `${job.id}-${job.viewport.id}__viewport.png`);
    const screenshotPath = path.join(ROOT, ...screenshotRelative.split("/"));
    const masterName = `${job.id}__${slug(job.route)}__${job.viewport.id}__full-page@highres.png`;
    const masterRelative = path.posix.join(".codex-tmp", "stage4-2b", "full-page-hires", masterName);
    const masterPath = path.join(ROOT, ...masterRelative.split("/"));
    const traceRelative = path.posix.join(".codex-tmp", "stage4-2b", "traces", `${job.id}-${job.viewport.id}.zip`);
    const tracePath = path.join(ROOT, ...traceRelative.split("/"));
    const startedAt = new Date().toISOString();
    let status = 0;
    let inspection = null;
    let error = null;
    try {
      if (job.id === "AUTH_EXPIRED") await context.clearCookies();
      const response = await page.goto(`${BASE}${job.route}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForTimeout(350);
      await applyScenarioState(page, context, job.id);
      status = response?.status() ?? 0;
      inspection = await inspectStable(page);
      if (!cli.verifyOnly && !cli.mastersOnly) await page.screenshot({ path: screenshotPath, type: "png", fullPage: false, animations: "disabled", caret: "hide", scale: "device" });
      if (!cli.verifyOnly && (cli.fullPage || cli.mastersOnly)) {
        await settleFullPage(page);
        await page.screenshot({ path: masterPath, type: "png", fullPage: true, animations: "disabled", caret: "hide", scale: "device" });
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const unexpectedFailed = failedRequests.filter((item) => !/example\.invalid|invalid\.example\.invalid/.test(item.url) && item.error !== "net::ERR_ABORTED");
    const unexpectedResponses = errorResponses.filter((item) => !/\/favicon\.ico(?:\?|$)/.test(item.url));
    const verified = !error && status > 0 && status < 400 && inspection?.stagingBanner && inspection?.heading !== "404" && !inspection?.overflow && pageErrors.length === 0 && unexpectedFailed.length === 0 && unexpectedResponses.length === 0;
    if (verified) await context.tracing.stop();
    else await context.tracing.stop({ path: tracePath });
    let masterEvidence = null;
    if (!error && !cli.verifyOnly && (cli.fullPage || cli.mastersOnly)) {
      try { masterEvidence = await verifyPng(masterPath, job.viewport.width * scale, inspection?.documentHeight ?? job.viewport.height, scale); }
      catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    }
    let viewportEvidence = null;
    if (!error && !cli.verifyOnly && !cli.mastersOnly) {
      try { viewportEvidence = await verifyPng(screenshotPath, job.viewport.width, job.viewport.height, 1); }
      catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    }
    const visualStateValid = !error && status > 0 && status < 400 && Boolean(inspection?.stagingBanner) && inspection?.heading !== "404";
    const viewportVerified = cli.mastersOnly
      ? priorResult?.viewportCaptureStatus === "VERIFIED"
      : Boolean(viewportEvidence?.valid) && visualStateValid;
    const masterVerified = (cli.fullPage || cli.mastersOnly)
      ? Boolean(masterEvidence?.valid) && visualStateValid
      : priorResult?.fullPageCaptureStatus === "VERIFIED";
    const result = {
      ...priorResult,
      id: key,
      area: job.id.split("_")[0],
      route: job.route,
      dynamicRouteExample: job.route,
      role: job.role,
      selectedAccount: "STAGE-FK-01",
      scenarioId: job.id,
      stateName: job.id,
      stateCategory: job.id.split("_")[0],
      viewport: job.viewport,
      setupSteps: ["reset canonical synthetic seed when mutation is required", `sign in as ${job.role}`],
      interactionSteps: ["open route", "inventory visible controls", "capture full page"],
      expectedResult: "Synthetic state renders without overflow, unauthorized exposure, console errors or unexpected failed requests.",
      mutatesSyntheticData: false,
      resetStrategy: "canonical synthetic reset",
      screenshotPath: cli.mastersOnly ? priorResult?.screenshotPath ?? null : cli.verifyOnly ? priorResult?.screenshotPath ?? null : screenshotRelative,
      viewportScreenshotPath: cli.mastersOnly ? priorResult?.viewportScreenshotPath ?? priorResult?.screenshotPath ?? null : cli.verifyOnly ? priorResult?.viewportScreenshotPath ?? null : screenshotRelative,
      viewportCaptureStatus: viewportVerified ? "VERIFIED" : "FAILED",
      fullPageMasterPath: (cli.fullPage || cli.mastersOnly) ? masterRelative : priorResult?.fullPageMasterPath ?? null,
      fullPageMasterWidth: masterEvidence?.width ?? priorResult?.fullPageMasterWidth ?? null,
      fullPageMasterHeight: masterEvidence?.height ?? priorResult?.fullPageMasterHeight ?? null,
      fullPageDeviceScaleFactor: (cli.fullPage || cli.mastersOnly) ? scale : priorResult?.fullPageDeviceScaleFactor ?? null,
      fullPageFileBytes: masterEvidence?.bytes ?? priorResult?.fullPageFileBytes ?? null,
      fullPageSha256: masterEvidence?.sha256 ?? priorResult?.fullPageSha256 ?? null,
      fullPageCaptureStatus: masterVerified ? "VERIFIED" : (cli.fullPage || cli.mastersOnly) ? "FAILED" : priorResult?.fullPageCaptureStatus ?? "NOT_STARTED",
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
      error,
      startedAt,
      finishedAt: new Date().toISOString(),
      fingerprint: fingerprint({ job, inspection }),
      auditStatus: verified && viewportVerified && (!(cli.fullPage || cli.mastersOnly) || masterVerified) ? "VERIFIED" : "BROKEN",
      notes: verified ? "" : "Inspect private trace and browser evidence.",
    };
    results.push(result);
    prior.completed[key] = result;
    await writeJsonCheckpoint(PROGRESS_PATH, prior);
    await context.close();
  }
} finally {
  await browser.close();
}

const finalResults = cli.resume
  ? Object.values(prior.completed).sort((left, right) => left.id.localeCompare(right.id))
  : results;
const summary = {
  generatedAt: new Date().toISOString(),
  browserEngine: executablePath,
  requestedJobs: finalResults.length,
  jobsInThisRun: jobs.length,
  verified: finalResults.filter((entry) => entry.auditStatus === "VERIFIED").length,
  broken: finalResults.filter((entry) => entry.auditStatus === "BROKEN").length,
  controlCount: finalResults.reduce((sum, entry) => sum + entry.controlCount, 0),
  screenshots: finalResults.filter((entry) => entry.screenshotPath).length,
  fullPageMasters: finalResults.filter((entry) => entry.fullPageCaptureStatus === "VERIFIED").length,
  fullPageBytes: finalResults.reduce((sum, entry) => sum + (entry.fullPageFileBytes ?? 0), 0),
  freeDiskBytesAtStart: freeDiskBytes,
  totalDiskBytes,
  failureTraces: finalResults.filter((entry) => entry.tracePath).length,
  viewports: VIEWPORTS,
  syntheticOnly: true,
};
await writeJsonCheckpoint(RESULT_PATH, { summary, results: finalResults });
console.log(JSON.stringify(summary, null, 2));
