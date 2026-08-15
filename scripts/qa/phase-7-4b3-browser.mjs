import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve(process.cwd());
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4b3");
const reviewOutput = path.join(output, "owner-review");
const credentialsPath = path.join(root, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Chrome or Edge is required.");

const viewports = [
  { id: "360x800", width: 360, height: 800 },
  { id: "390x844", width: 390, height: 844 },
  { id: "430x932", width: 430, height: 932 },
  { id: "768x1024", width: 768, height: 1024 },
  { id: "1024x768", width: 1024, height: 768 },
  { id: "1440x900", width: 1440, height: 900 },
];
const accounts = {
  flipkart: "stage3-account-fk-01",
  amazon: "stage3-account-amz-01",
  empty: "stage3-account-fk-02",
};
const expectedCommon = ["/work", "/work/scan", "/owner/product-inventory/refresh", "/owner/consignments/new", "/owner/consignments", "/owner/imports"];

await mkdir(reviewOutput, { recursive: true });
const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
const owner = credentials.users.find((entry) => entry.displayRole === "Synthetic Owner");
if (!owner) throw new Error("Synthetic Owner credential is unavailable.");

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(owner.username);
  await page.locator('input[name="password"]').fill(owner.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit()),
  ]);
}

async function selectAccount(page, accountId) {
  await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole("button", { name: "Select account" }).click(),
  ]);
  await page.getByRole("heading", { name: "Operations overview", exact: true }).waitFor({ timeout: 20_000 });
  await settle(page);
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    await document.fonts.ready;
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    for (let y = 0; y < height; y += Math.max(320, Math.floor(innerHeight * 0.8))) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
    scrollTo(0, 0);
    for (const animation of document.getAnimations()) animation.pause();
  });
}

async function keyboardEvidence(page) {
  await page.evaluate(() => { document.body.focus(); scrollTo(0, 0); });
  const sequence = [];
  for (let index = 0; index < 90; index += 1) {
    await page.keyboard.press("Tab");
    const item = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      const style = getComputedStyle(active);
      return {
        text: active.innerText?.trim() || active.getAttribute("aria-label") || "",
        href: active instanceof HTMLAnchorElement ? active.getAttribute("href") : null,
        inMain: Boolean(active.closest("#app-shell-main")),
        focusVisible: active.matches(":focus-visible"),
        outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      };
    });
    if (item) sequence.push(item);
  }
  const mainHrefs = sequence.filter((item) => item.inMain && item.href).map((item) => item.href);
  const hasRecentImport = mainHrefs.some((href) => href.startsWith("/owner/imports/stage4-import-"));
  const required = ["/work/scan", "/work", "/work/pick?source=ORDER", "/work/mark", "/work/assemble", "/work/pack", "/owner/product-inventory/refresh", "/owner/imports"];
  return {
    sequence,
    mainHrefs,
    passed: required.every((href) => mainHrefs.includes(href))
      && hasRecentImport
      && sequence.filter((item) => item.inMain).every((item) => item.focusVisible && item.outline.startsWith("3px solid")),
  };
}

async function routeOwnerEvidence(page, viewport) {
  if (viewport.width < 1280) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    const count = await page.locator('[aria-current="page"]').count();
    await page.keyboard.press("Escape");
    return count;
  }
  return page.locator('[aria-current="page"]').count();
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };
    const mainLinks = [...document.querySelectorAll("#app-shell-main a")].filter(visible);
    const targets = mainLinks.map((link) => {
      const rect = link.getBoundingClientRect();
      return { text: link.textContent?.trim() ?? "", href: link.getAttribute("href"), width: rect.width, height: rect.height };
    });
    const text = document.body.innerText;
    return {
      h1Count: document.querySelectorAll("h1").length,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      clientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      currentPageCount: document.querySelectorAll('[aria-current="page"]').length,
      mainHrefs: [...new Set(mainLinks.map((link) => link.getAttribute("href")).filter(Boolean))],
      targets,
      undersized: targets.filter((target) => target.width < 44 || target.height < 44),
      text,
      invalidCopy: /\b(undefined|null|Invalid Date)\b/.test(text),
      statusValues: [...document.querySelectorAll("[data-status]")].map((item) => ({ status: item.getAttribute("data-status"), tone: item.getAttribute("data-tone"), text: item.textContent?.trim() })),
    };
  });
}

function health(errors) {
  return Object.values(errors).every((items) => items.length === 0);
}

async function capture(page, name) {
  await page.evaluate(() => {
    scrollTo(0, 0);
    for (const element of document.querySelectorAll("*")) {
      if (element.scrollHeight > element.clientHeight) element.scrollTop = 0;
    }
  });
  const file = path.join(reviewOutput, `${name}.png`);
  await page.screenshot({ path: file, type: "png", fullPage: true, animations: "disabled", caret: "hide" });
  return path.relative(root, file);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = monitor(page);
    await login(page);

    await selectAccount(page, accounts.flipkart);
    const flipkart = await inspect(page);
    const flipkartKeyboard = await keyboardEvidence(page);
    const flipkartRouteOwnerCount = await routeOwnerEvidence(page, viewport);
    const flipkartPass = flipkart.heading === "Operations overview"
      && flipkart.h1Count === 1
      && flipkart.clientWidth === flipkart.documentScrollWidth
      && flipkart.clientWidth === flipkart.bodyScrollWidth
      && flipkartRouteOwnerCount === 1
      && expectedCommon.every((href) => flipkart.mainHrefs.includes(href))
      && flipkart.mainHrefs.includes("/owner/uploads/new")
      && flipkart.undersized.length === 0
      && !flipkart.invalidCopy
      && flipkartKeyboard.passed
      && health(errors);
    results.push({ state: "FLIPKART_POPULATED_DASHBOARD", viewport: viewport.id, pass: flipkartPass, inspection: flipkart, routeOwnerCount: flipkartRouteOwnerCount, keyboard: flipkartKeyboard, errors: structuredClone(errors) });
    results.push({ state: "DASHBOARD_IMPORT_ATTENTION", viewport: viewport.id, pass: /Imports needing action\s+[1-9]/.test(flipkart.text) && flipkart.statusValues.some((item) => item.status === "FAILED" && item.tone === "error") && flipkart.statusValues.some((item) => item.status === "NEEDS_MAPPING" && item.tone === "warning") && flipkart.statusValues.some((item) => item.status === "COMPLETED_WITH_WARNINGS" && item.tone === "warning"), inspection: flipkart, errors: structuredClone(errors) });
    results.push({ state: "DASHBOARD_LONG_FILENAME", viewport: viewport.id, pass: flipkart.text.includes("attention-and-long-filename") && flipkart.clientWidth === flipkart.documentScrollWidth && flipkart.clientWidth === flipkart.bodyScrollWidth, inspection: flipkart, errors: structuredClone(errors) });
    if (viewport.id === "390x844" || viewport.id === "1440x900") await capture(page, `flipkart-${viewport.width}`);
    if (viewport.id === "390x844") await capture(page, "attention-390");

    await selectAccount(page, accounts.amazon);
    const amazon = await inspect(page);
    const amazonRouteOwnerCount = await routeOwnerEvidence(page, viewport);
    const amazonPass = amazon.clientWidth === amazon.documentScrollWidth
      && amazon.clientWidth === amazon.bodyScrollWidth
      && amazonRouteOwnerCount === 1
      && expectedCommon.every((href) => amazon.mainHrefs.includes(href))
      && !amazon.mainHrefs.includes("/owner/uploads/new")
      && !amazon.text.includes("Latest Daily Orders")
      && amazon.text.includes("Amazon Product Catalog")
      && amazon.undersized.length === 0
      && !amazon.invalidCopy
      && health(errors);
    results.push({ state: "AMAZON_POPULATED_DASHBOARD", viewport: viewport.id, pass: amazonPass, inspection: amazon, routeOwnerCount: amazonRouteOwnerCount, errors: structuredClone(errors) });
    if (viewport.id === "390x844" || viewport.id === "1440x900") await capture(page, `amazon-${viewport.width}`);

    await selectAccount(page, accounts.empty);
    const empty = await inspect(page);
    const emptyRouteOwnerCount = await routeOwnerEvidence(page, viewport);
    const emptyPass = empty.clientWidth === empty.documentScrollWidth
      && empty.clientWidth === empty.bodyScrollWidth
      && emptyRouteOwnerCount === 1
      && empty.text.includes("No import history yet")
      && ["Pick queue", "Mark queue", "Assembly queue", "Pack queue"].every((label) => new RegExp(`${label}\\s+0`).test(empty.text))
      && empty.undersized.length === 0
      && !empty.invalidCopy
      && health(errors);
    results.push({ state: "DASHBOARD_EMPTY", viewport: viewport.id, pass: emptyPass, inspection: empty, routeOwnerCount: emptyRouteOwnerCount, errors: structuredClone(errors) });
    if (viewport.id === "390x844") await capture(page, "empty-390");

    await context.close();
  }

  for (const reflow of [
    { id: "390@200%", width: 195, height: 422 },
    { id: "768@200%", width: 384, height: 512 },
    { id: "1024@200%", width: 512, height: 384 },
    { id: "1440@200%", width: 720, height: 450 },
  ]) {
    const context = await browser.newContext({ viewport: { width: reflow.width, height: reflow.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = monitor(page);
    await login(page);
    await selectAccount(page, accounts.flipkart);
    const inspection = await inspect(page);
    const pass = inspection.clientWidth === inspection.documentScrollWidth
      && inspection.clientWidth === inspection.bodyScrollWidth
      && inspection.text.includes("Selected seller account")
      && inspection.text.includes("Work queues")
      && inspection.text.includes("Recent imports")
      && expectedCommon.every((href) => inspection.mainHrefs.includes(href))
      && inspection.undersized.length === 0
      && health(errors);
    results.push({ state: "DASHBOARD_200_PERCENT_REFLOW", viewport: reflow.id, pass, inspection, errors: structuredClone(errors) });
    await context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.pass || !health(result.errors));
const report = {
  schema: "Phase7_4B3DashboardBrowserV1",
  browser: executablePath,
  records: results.length,
  failures: failures.length,
  results,
};
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`) }, null, 2));
if (failures.length) process.exitCode = 1;
