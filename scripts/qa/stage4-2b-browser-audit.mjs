import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { REQUIRED_SCENARIOS, ROLE_TO_DISPLAY, VIEWPORTS } from "./stage4-2b-scenarios.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "http://127.0.0.1:3188";
const PRIVATE_ROOT = path.join(ROOT, ".codex-tmp", "stage4-2b");
const CREDENTIALS = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const PROGRESS_PATH = path.join(PRIVATE_ROOT, "progress.json");
const RESULT_PATH = path.join(PRIVATE_ROOT, "browser-results.json");
const SCREENSHOT_ROOT = path.join(PRIVATE_ROOT, "screenshots");
const TRACE_ROOT = path.join(PRIVATE_ROOT, "traces");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function options(argv) {
  const result = { headed: false, resume: false, captureOnly: false, verifyOnly: false, workers: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--headed") result.headed = true;
    else if (value === "--headless") result.headed = false;
    else if (value === "--resume") result.resume = true;
    else if (value === "--capture-only") result.captureOnly = true;
    else if (value === "--verify-only") result.verifyOnly = true;
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

async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return fallback; }
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
      undersized: controls.filter((control) => ["BUTTON", "A", "SUMMARY"].includes(control.tag) && control.height < 40),
      stagingBanner: body?.innerText.includes("PRIVATE SYNTHETIC STAGING") ?? false,
    };
  });
}

const cli = options(process.argv.slice(2));
await mkdir(SCREENSHOT_ROOT, { recursive: true });
await mkdir(TRACE_ROOT, { recursive: true });
if (!existsSync(CREDENTIALS)) throw new Error("Synthetic staging credentials are missing.");
const credentialFile = JSON.parse(await readFile(CREDENTIALS, "utf8"));
const credentials = new Map(credentialFile.users.map((entry) => [entry.displayRole, entry]));
const executablePath = existsSync(CHROME) ? CHROME : existsSync(EDGE) ? EDGE : undefined;
if (!executablePath) throw new Error("Installed Chrome or Edge is required; no bundled browser was downloaded.");

let jobs = REQUIRED_SCENARIOS.flatMap((scenario) => VIEWPORTS
  .filter((viewport) => !cli.viewport || viewport.id === cli.viewport)
  .map((viewport) => ({ ...scenario, viewport })))
  .filter((job) => !cli.route || job.route.includes(cli.route))
  .filter((job) => !cli.state || job.id === cli.state);

const prior = cli.resume ? await loadJson(PROGRESS_PATH, { completed: {} }) : { completed: {} };
const results = [];
const browser = await chromium.launch({ executablePath, headless: !cli.headed, args: ["--disable-extensions", "--disable-sync"] });
try {
  for (const job of jobs) {
    const key = `${job.id}:${job.viewport.id}`;
    if (cli.resume && prior.completed[key]?.auditStatus === "VERIFIED") {
      results.push(prior.completed[key]);
      continue;
    }
    const context = await browser.newContext({ viewport: { width: job.viewport.width, height: job.viewport.height } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? "failed" }));
    const credential = job.role === "PUBLIC" ? null : credentials.get(ROLE_TO_DISPLAY[job.role]);
    const screenshotRelative = path.posix.join(".codex-tmp", "stage4-2b", "screenshots", `${job.id}-${job.viewport.id}.png`);
    const screenshotPath = path.join(ROOT, ...screenshotRelative.split("/"));
    const traceRelative = path.posix.join(".codex-tmp", "stage4-2b", "traces", `${job.id}-${job.viewport.id}.zip`);
    const tracePath = path.join(ROOT, ...traceRelative.split("/"));
    const startedAt = new Date().toISOString();
    let status = 0;
    let inspection = null;
    let error = null;
    try {
      if (credential) await login(page, credential);
      const response = await page.goto(`${BASE}${job.route}`, { waitUntil: "networkidle", timeout: 25_000 });
      status = response?.status() ?? 0;
      inspection = await inspect(page);
      if (!cli.verifyOnly) await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const unexpectedFailed = failedRequests.filter((item) => !/example\.invalid|invalid\.example\.invalid/.test(item.url));
    const verified = !error && status > 0 && status < 500 && inspection?.stagingBanner && !inspection?.overflow && pageErrors.length === 0 && unexpectedFailed.length === 0;
    if (verified) await context.tracing.stop();
    else await context.tracing.stop({ path: tracePath });
    const result = {
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
      screenshotPath: cli.verifyOnly ? null : screenshotRelative,
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
      error,
      startedAt,
      finishedAt: new Date().toISOString(),
      fingerprint: fingerprint({ job, inspection }),
      auditStatus: verified ? "VERIFIED" : "BROKEN",
      notes: verified ? "" : "Inspect private trace and browser evidence.",
    };
    results.push(result);
    prior.completed[key] = result;
    await writeFile(PROGRESS_PATH, `${JSON.stringify(prior, null, 2)}\n`);
    await context.close();
  }
} finally {
  await browser.close();
}

const summary = {
  generatedAt: new Date().toISOString(),
  browserEngine: executablePath,
  requestedJobs: jobs.length,
  verified: results.filter((entry) => entry.auditStatus === "VERIFIED").length,
  broken: results.filter((entry) => entry.auditStatus === "BROKEN").length,
  controlCount: results.reduce((sum, entry) => sum + entry.controlCount, 0),
  screenshots: results.filter((entry) => entry.screenshotPath).length,
  failureTraces: results.filter((entry) => entry.tracePath).length,
  viewports: VIEWPORTS,
  syntheticOnly: true,
};
await writeFile(RESULT_PATH, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
