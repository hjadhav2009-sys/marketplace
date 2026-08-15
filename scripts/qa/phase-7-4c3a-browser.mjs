import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c3a");
const credentialsPath = path.join(root, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");

await mkdir(output, { recursive: true });
const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
const marker = credentials.users.find((entry) => entry.scenario === "MARKER");
if (!marker) throw new Error("Missing synthetic MARKER credential.");

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function session(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = monitor(page);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(marker.username);
  await page.locator('input[name="password"]').fill(marker.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit()),
  ]);
  return { context, page, errors };
}

async function openMark(page, query) {
  await page.goto(`${base}/work/marking?q=${encodeURIComponent(query)}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-responsive-work-card]").first().waitFor({ timeout: 20_000 });
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled;
    };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select,#app-shell-main summary")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      undersized: controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height };
      }).filter((item) => item.width < 44 || item.height < 44),
    };
  });
}

function errorsHealthy(errors) {
  return Object.values(errors).every((items) => items.length === 0);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
try {
  for (const viewport of [{ id: "390x844", width: 390, height: 844 }, { id: "1440x900", width: 1440, height: 900 }]) {
    const current = await session(browser, viewport);
    const { page, errors } = current;

    await openMark(page, "STAGE-FK-SKU-002");
    const multiCard = page.locator("[data-responsive-work-card]").first();
    const multiButton = multiCard.getByRole("button", { name: "Marking Completed" });
    await multiButton.waitFor();
    await multiButton.focus();
    await multiButton.click();
    const flow = page.locator('[data-worker-overlay="PROCESS_FLOW"] [role="dialog"]');
    await flow.waitFor();
    const flowText = await flow.innerText();
    const focusInDialog = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
    await page.keyboard.press("Escape");
    const focusReturned = await multiButton.evaluate((element) => document.activeElement === element);

    const partialButton = multiCard.getByRole("button", { name: "Partial Quantity" });
    await partialButton.click();
    const partial = page.locator('[data-worker-overlay="PARTIAL_QUANTITY"] [role="dialog"]');
    await partial.waitFor();
    const target = partial.locator('input[name="targetQuantity"]');
    const bounds = { min: await target.getAttribute("min"), max: await target.getAttribute("max") };
    await page.keyboard.press("Escape");
    const multiInspection = await inspect(page);
    results.push({
      state: "MULTI_DESTINATION_MARK",
      viewport: viewport.id,
      pass: flowText.includes("Send to Pack") && flowText.includes("Send to Assembly") && focusInDialog && focusReturned && bounds.min === "1" && bounds.max === "1" && multiInspection.clientWidth === multiInspection.scrollWidth && multiInspection.undersized.length === 0 && errorsHealthy(errors),
      flowText,
      focusInDialog,
      focusReturned,
      bounds,
      inspection: multiInspection,
      errors: structuredClone(errors),
    });

    await openMark(page, "STAGE-C1A1-B-FALLBACK-ACTUAL-MARK");
    const singleCard = page.locator("[data-responsive-work-card]").first();
    const singleComplete = singleCard.getByRole("button", { name: "Complete remaining 3" });
    await singleComplete.waitFor();
    const singleInspection = await inspect(page);
    results.push({
      state: "SINGLE_DESTINATION_MARK",
      viewport: viewport.id,
      pass: await singleComplete.isEnabled() && await singleCard.getByRole("button", { name: "Marking Completed" }).count() === 0 && singleInspection.clientWidth === singleInspection.scrollWidth && singleInspection.undersized.length === 0 && errorsHealthy(errors),
      inspection: singleInspection,
      errors: structuredClone(errors),
    });
    await current.context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.pass);
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify({ schema: "Phase7_4C3AMarkProgressSafetyBrowserV1", browser: executablePath, records: results.length, failures: failures.length, results }, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((result) => `${result.state}:${result.viewport}`) }, null, 2));
if (failures.length) process.exitCode = 1;
