import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c2");
const reviewOutput = path.join(output, "owner-review");
const credentialsPath = path.join(root, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");

const viewports = [
  { id: "360x800", width: 360, height: 800 },
  { id: "390x844", width: 390, height: 844 },
  { id: "430x932", width: 430, height: 932 },
  { id: "768x1024", width: 768, height: 1024 },
  { id: "1024x768", width: 1024, height: 768 },
  { id: "1440x900", width: 1440, height: 900 },
];
const accounts = {
  amazon: "stage3-account-amz-01",
  empty: "stage3-account-fk-02",
  flipkart: "stage3-account-fk-01",
  projection: "stage4-account-pick-projection",
};

await mkdir(reviewOutput, { recursive: true });
const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
const credential = (scenario) => {
  const item = credentials.users.find((entry) => entry.scenario === scenario);
  if (!item) throw new Error(`Missing synthetic ${scenario} credential.`);
  return item;
};

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function session(browser, viewport, scenario = "OWNER") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route(/https:\/\/(invalid\.example\.invalid|example\.invalid)\//, (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-image" }));
  const page = await context.newPage();
  const errors = monitor(page);
  const user = credential(scenario);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(user.username);
  await page.locator('input[name="password"]').fill(user.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit()),
  ]);
  return { context, page, errors };
}

async function selectAccount(page, accountId) {
  await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole("button", { name: "Select account" }).click(),
  ]);
}

async function openPick(page, route = "/work/pick") {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").filter({ hasText: /^Pick$/ }).waitFor({ timeout: 20_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 40));
    scrollTo(0, 0);
  });
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled;
    };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select,#app-shell-main summary")].filter(visible);
    const cards = [...document.querySelectorAll("[data-responsive-work-card]")];
    return {
      cards: cards.length,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      currentPages: document.querySelectorAll('[aria-current="page"]').length,
      pickNavigationEntries: [...document.querySelectorAll('a[href^="/work/pick"]')].filter((item) => item.closest("nav") && /Pick/.test(item.textContent ?? "")).length,
      rawRouteCodes: [...document.body.innerText.matchAll(/\bPICK_(?:PACK|MARK_PACK|ASSEMBLE_PACK|MARK_ASSEMBLE_PACK)\b/g)].map((match) => match[0]),
      sourceSelectors: document.querySelectorAll("[data-pick-source-selector]").length,
      text: document.body.innerText,
      undersized: controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height };
      }).filter((item) => item.width < 44 || item.height < 44),
    };
  });
}

async function screenshot(page, name) {
  const target = path.join(reviewOutput, name);
  await page.screenshot({ path: target, fullPage: true, animations: "disabled", caret: "hide" });
  return path.relative(root, target);
}

function healthy(inspection, errors, viewportWidth) {
  return inspection.clientWidth === inspection.scrollWidth
    && inspection.currentPages === (viewportWidth >= 1280 ? 1 : 0)
    && inspection.pickNavigationEntries <= 2
    && inspection.rawRouteCodes.length === 0
    && inspection.undersized.length === 0
    && Object.values(errors).every((items) => items.length === 0);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
const screenshots = [];
try {
  for (const viewport of viewports) {
    const owner = await session(browser, viewport);
    await selectAccount(owner.page, accounts.flipkart);

    await openPick(owner.page, "/work/pick?source=ORDER");
    const order = await inspect(owner.page);
    const orderPass = healthy(order, owner.errors, viewport.width)
      && order.sourceSelectors === 1
      && order.text.includes("Customer Orders")
      && order.text.includes("Consignments")
      && order.text.includes("Ready to pick")
      && order.text.includes("Picking in progress")
      && order.text.includes("Work paused")
      && order.text.includes("Pick quantity");
    results.push({ state: "FLIPKART_ORDER_PICK", viewport: viewport.id, pass: orderPass, inspection: order, errors: structuredClone(owner.errors) });
    if (viewport.id === "390x844") screenshots.push(await screenshot(owner.page, "390-flipkart-order-pick.png"));
    if (viewport.id === "1440x900") screenshots.push(await screenshot(owner.page, "1440-flipkart-order-pick.png"));

    const selector = owner.page.locator("[data-pick-source-selector]");
    const consignmentLink = selector.getByRole("link", { name: /Consignments/ });
    await consignmentLink.focus();
    const focusVisible = await consignmentLink.evaluate((element) => element.matches(":focus-visible") && getComputedStyle(element).outlineStyle !== "none");
    await Promise.all([owner.page.waitForURL(/source=CONSIGNMENT/), owner.page.keyboard.press("Enter")]);
    await owner.page.locator("[data-responsive-work-card]").first().waitFor({ timeout: 20_000 });
    const consignment = await inspect(owner.page);
    const consignmentPass = healthy(consignment, owner.errors, viewport.width)
      && focusVisible
      && consignment.sourceSelectors === 1
      && consignment.text.includes("Consignment")
      && consignment.text.includes("Ready to pick")
      && consignment.text.includes("Work paused");
    results.push({ state: "FLIPKART_CONSIGNMENT_PICK", viewport: viewport.id, pass: consignmentPass, inspection: consignment, focusVisible, errors: structuredClone(owner.errors) });
    if (viewport.id === "390x844") screenshots.push(await screenshot(owner.page, "390-flipkart-consignment-pick.png"));
    if (viewport.id === "1440x900") screenshots.push(await screenshot(owner.page, "1440-flipkart-consignment-pick.png"));

    if (viewport.id === "390x844") {
      const readyCard = owner.page.locator("[data-responsive-work-card]", { hasText: "C1A1 Case C direct Pack" }).first();
      await readyCard.scrollIntoViewIfNeeded();
      screenshots.push(await screenshot(owner.page, "390-pick-ready.png"));
      const flowTrigger = readyCard.getByRole("button", { name: /Complete Pick/ });
      await flowTrigger.focus();
      await flowTrigger.click();
      const dialog = owner.page.locator('[data-worker-overlay="PROCESS_FLOW"] [role="dialog"]');
      await dialog.waitFor();
      const focusInDialog = await owner.page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
      const flowText = await dialog.innerText();
      screenshots.push(await screenshot(owner.page, "390-process-flow.png"));
      await owner.page.keyboard.press("Escape");
      const focusReturned = await flowTrigger.evaluate((element) => document.activeElement === element);
      results.push({ state: "PROCESS_FLOW_FOCUS", viewport: viewport.id, pass: focusInDialog && focusReturned && flowText.includes("Current work flow") && flowText.includes("Direct to Pack") && !/PICK_PACK/.test(flowText), focusInDialog, focusReturned });

      await selectAccount(owner.page, accounts.amazon);
      await openPick(owner.page, "/work/pick?source=ORDER");
      const amazon = await inspect(owner.page);
      results.push({ state: "AMAZON_CAPABILITY", viewport: viewport.id, pass: healthy(amazon, owner.errors, viewport.width) && amazon.cards > 0 && amazon.sourceSelectors === 0 && amazon.text.includes("Consignments") && !amazon.text.includes("Customer Orders"), inspection: amazon, errors: structuredClone(owner.errors) });
      screenshots.push(await screenshot(owner.page, "390-amazon-consignment-pick.png"));

      await selectAccount(owner.page, accounts.empty);
      await openPick(owner.page);
      const empty = await inspect(owner.page);
      results.push({ state: "TRUE_EMPTY", viewport: viewport.id, pass: healthy(empty, owner.errors, viewport.width) && empty.cards === 0 && empty.text.includes("No Pick work right now"), inspection: empty, errors: structuredClone(owner.errors) });
      screenshots.push(await screenshot(owner.page, "390-true-empty.png"));

      await selectAccount(owner.page, accounts.projection);
      await openPick(owner.page);
      const unavailable = await inspect(owner.page);
      results.push({ state: "PROJECTION_UNAVAILABLE", viewport: viewport.id, pass: healthy(unavailable, owner.errors, viewport.width) && unavailable.cards === 0 && unavailable.text.includes("Pick queue temporarily unavailable") && unavailable.text.includes("not safe to process"), inspection: unavailable, errors: structuredClone(owner.errors) });
    }
    await owner.context.close();
  }

  const picker = await session(browser, { width: 390, height: 844 }, "PICKER");
  await openPick(picker.page, "/work/pick?source=ORDER");
  const pickerInspection = await inspect(picker.page);
  results.push({ state: "PICKER_ROLE", viewport: "390x844", pass: healthy(pickerInspection, picker.errors, 390) && pickerInspection.text.includes("Complete Pick") && pickerInspection.text.includes("Details"), inspection: pickerInspection, errors: picker.errors });
  await picker.context.close();

  const readOnly = await session(browser, { width: 390, height: 844 }, "VIEW_ALL");
  await openPick(readOnly.page, "/work/pick?source=ORDER");
  const readOnlyInspection = await inspect(readOnly.page);
  const readOnlyButtons = await readOnly.page.locator("[data-work-actions] button").allTextContents();
  results.push({ state: "VIEW_ALL_READ_ONLY", viewport: "390x844", pass: healthy(readOnlyInspection, readOnly.errors, 390) && readOnlyInspection.text.includes("Read-only Pick view") && readOnlyButtons.every((label) => ["Details", "Open Problem"].includes(label.trim())) && !readOnlyButtons.some((label) => /Complete|Partial|^Problem$/.test(label)), inspection: readOnlyInspection, buttons: readOnlyButtons, errors: readOnly.errors });
  await readOnly.context.close();

  const noPick = await session(browser, { width: 390, height: 844 }, "IMPORT_MANAGER");
  await noPick.page.goto(`${base}/work/pick`, { waitUntil: "domcontentloaded" });
  const noPickPath = new URL(noPick.page.url()).pathname;
  results.push({ state: "NO_PICK_PERMISSION", viewport: "390x844", pass: noPickPath !== "/work/pick" && !/Complete Pick/.test(await noPick.page.locator("body").innerText()), path: noPickPath, errors: noPick.errors });
  await noPick.context.close();

  for (const reflow of [
    { label: "390@200", width: 320, height: 844 },
    { label: "768@200", width: 384, height: 1024 },
    { label: "1024@200", width: 512, height: 768 },
    { label: "1440@200", width: 720, height: 900 },
  ]) {
    const owner = await session(browser, { width: reflow.width, height: reflow.height });
    await selectAccount(owner.page, accounts.flipkart);
    await openPick(owner.page, "/work/pick?source=CONSIGNMENT");
    const inspection = await inspect(owner.page);
    results.push({ state: "REFLOW_200_PERCENT", viewport: reflow.label, pass: healthy(inspection, owner.errors, reflow.width) && inspection.cards > 0 && inspection.sourceSelectors === 1, inspection, errors: owner.errors });
    await owner.context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C2PickBrowserV1", browser: executablePath, records: results.length, failures: failures.length, screenshots, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), screenshots }, null, 2));
if (failures.length) process.exitCode = 1;
