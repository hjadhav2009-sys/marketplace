import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c1a1");
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
const accountId = "stage3-account-fk-01";
const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
const owner = credentials.users.find((entry) => entry.scenario === "OWNER");
if (!owner) throw new Error("Missing synthetic OWNER credential.");
await mkdir(reviewOutput, { recursive: true });

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function ownerSession(browser, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route("https://invalid.example.invalid/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-invalid-image" }));
  const page = await context.newPage();
  const errors = monitor(page);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(owner.username);
  await page.locator('input[name="password"]').fill(owner.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }), page.locator("form").first().evaluate((form) => form.requestSubmit())]);
  await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
  await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]);
  return { context, page, errors };
}

async function open(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-responsive-work-card]").first().waitFor({ timeout: 20_000 });
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, document.documentElement.scrollHeight); await new Promise((resolve) => setTimeout(resolve, 40)); scrollTo(0, 0); });
}

function card(page, title) {
  return page.locator("[data-responsive-work-card]", { hasText: title }).first();
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled; };
    const controls = [...document.querySelectorAll("[data-responsive-work-card] button,[data-responsive-work-card] a,[data-responsive-work-card] input:not([type=hidden]),[data-responsive-work-card] textarea,[data-responsive-work-card] select,[data-responsive-work-card] summary")].filter(visible);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      cardCount: document.querySelectorAll("[data-responsive-work-card]").length,
      undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: element.textContent?.trim().slice(0, 70), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44),
      rawRoute: /\bPICK_(PACK|MARK_PACK|ASSEMBLE_PACK|MARK_ASSEMBLE_PACK)\b/.test(document.body.innerText),
      duplicateDisclosure: /Identifiers and work context|Identifiers and route context/.test(document.body.innerText),
    };
  });
}

async function screenshot(page, name) {
  const target = path.join(reviewOutput, name);
  await page.screenshot({ path: target, fullPage: true, animations: "disabled", caret: "hide" });
  return path.relative(root, target);
}

async function openOverlay(page, trigger, kind) {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await trigger.click();
  const root = page.locator(`[data-worker-overlay="${kind}"]`);
  await root.getByRole("dialog").waitFor();
  const initialFocus = await page.evaluate(() => ({ inDialog: Boolean(document.activeElement?.closest('[role="dialog"]')), text: document.activeElement?.textContent?.trim() ?? "" }));
  return { root, initialFocus };
}

function errorsHealthy(errors) {
  return Object.values(errors).every((items) => items.length === 0);
}

function containsStages(text, stages) {
  let cursor = 0;
  return stages.every((stage) => {
    const index = text.indexOf(stage, cursor);
    if (index < 0) return false;
    cursor = index + stage.length;
    return true;
  });
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
const screenshots = [];
try {
  for (const viewport of viewports) {
    const session = await ownerSession(browser, viewport);
    const { page, errors } = session;

    await open(page, "/work/marking");
    const caseA = card(page, "C1A1 Case A actual Mark and Assembly route");
    const caseB = card(page, "C1A1 Case B fallback with actual Mark route");
    const caseD = card(page, "C1A1 Case D actual Mark with required instructions missing");
    const [aText, bText, dText, markInspection] = await Promise.all([caseA.innerText(), caseB.innerText(), caseD.innerText(), inspect(page)]);
    const markPass = containsStages(aText, ["Pick", "Mark", "Assembly", "Pack"])
      && containsStages(bText, ["Pick", "Mark", "Pack"])
      && dText.includes("Marking instructions unavailable")
      && markInspection.clientWidth === markInspection.scrollWidth
      && markInspection.undersized.length === 0
      && !markInspection.rawRoute
      && !markInspection.duplicateDisclosure;
    results.push({ state: "ROUTE_TRUTH_MARK", viewport: viewport.id, pass: markPass, inspection: markInspection, caseA: aText, caseB: bText, caseD: dText });
    if (viewport.id === "390x844") {
      await caseA.scrollIntoViewIfNeeded();
      screenshots.push(await screenshot(page, "390-actual-route-override-mark.png"));
      await caseD.scrollIntoViewIfNeeded();
      screenshots.push(await screenshot(page, "390-required-missing-instruction.png"));
    }
    if (viewport.id === "1440x900") {
      await caseA.scrollIntoViewIfNeeded();
      screenshots.push(await screenshot(page, "1440-actual-route-mark.png"));
    }

    await open(page, "/work/consignments/pick");
    const caseC = card(page, "C1A1 Case C direct Pack without optional instructions");
    const cText = await caseC.innerText();
    const pickInspection = await inspect(page);
    const caseCPass = containsStages(cText, ["Pick", "Pack"]) && !/instructions are unavailable/i.test(cText) && pickInspection.clientWidth === pickInspection.scrollWidth && pickInspection.undersized.length === 0 && !pickInspection.rawRoute && !pickInspection.duplicateDisclosure;
    results.push({ state: "DIRECT_PACK_RELEVANCE", viewport: viewport.id, pass: caseCPass, inspection: pickInspection, card: cText });

    const flow = await openOverlay(page, caseC.getByRole("button", { name: /Complete 6 and choose route/ }), "PROCESS_FLOW");
    const flowText = await flow.root.innerText();
    const flowPass = flow.initialFocus.inDialog && /Current work flow:/i.test(flowText) && containsStages(flowText, ["Pick", "Pack"]) && flowText.includes("Marking") && flowText.includes("Assembly");
    results.push({ state: "PROCESS_FLOW", viewport: viewport.id, pass: flowPass, initialFocus: flow.initialFocus, text: flowText });
    if (viewport.id === "390x844") screenshots.push(await screenshot(page, "390-process-flow.png"));
    if (viewport.id === "1440x900") screenshots.push(await screenshot(page, "1440-process-flow.png"));
    await page.keyboard.press("Escape");

    const detailsTrigger = caseC.getByRole("button", { name: "Details" });
    const details = await openOverlay(page, detailsTrigger, "DETAILS");
    const detailsText = await details.root.innerText();
    const detailsPass = details.initialFocus.inDialog && containsStages(detailsText, ["Pick", "Pack"]) && !/instructions are unavailable/i.test(detailsText);
    results.push({ state: "DETAILS_TRUTH", viewport: viewport.id, pass: detailsPass, initialFocus: details.initialFocus, text: detailsText });
    if (viewport.id === "390x844") screenshots.push(await screenshot(page, "390-details.png"));
    if (viewport.id === "1440x900") screenshots.push(await screenshot(page, "1440-details.png"));
    await page.keyboard.press("Escape");

    if (viewport.id === "390x844") {
      screenshots.push(await screenshot(page, "390-pick-ready.png"));
      await caseC.scrollIntoViewIfNeeded();
      screenshots.push(await screenshot(page, "390-direct-pack-no-warning.png"));
      const partial = await openOverlay(page, caseC.getByRole("button", { name: "Partial Quantity" }), "PARTIAL_QUANTITY");
      const quantity = await partial.root.locator('input[name="targetQuantity"]');
      const bounds = { min: await quantity.getAttribute("min"), max: await quantity.getAttribute("max"), value: await quantity.inputValue() };
      results.push({ state: "PARTIAL_BOUNDS", viewport: viewport.id, pass: bounds.min === "1" && bounds.max === "5" && bounds.value === "1", bounds });
      screenshots.push(await screenshot(page, "390-partial-quantity.png"));
      await page.keyboard.press("Escape");

      const problem = await openOverlay(page, caseC.getByRole("button", { name: "Problem" }), "PROBLEM");
      results.push({ state: "PROBLEM", viewport: viewport.id, pass: problem.initialFocus.inDialog, initialFocus: problem.initialFocus });
      screenshots.push(await screenshot(page, "390-problem.png"));
      await page.keyboard.press("Escape");

      const imageTrigger = caseC.getByRole("button", { name: /Open large image preview/ });
      const image = await openOverlay(page, imageTrigger, "IMAGE");
      const initialCounter = await image.root.getByText(/Image 1 of 3/).isVisible();
      const titleFocused = /Product image/.test(image.initialFocus.text);
      await page.keyboard.press("ArrowRight");
      const advanced = await image.root.getByText(/Image 2 of 3/).isVisible();
      await page.keyboard.press("ArrowLeft");
      const returned = await image.root.getByText(/Image 1 of 3/).isVisible();
      screenshots.push(await screenshot(page, "390-image-preview.png"));
      await page.keyboard.press("Escape");
      const focusReturned = await imageTrigger.evaluate((element) => document.activeElement === element);
      results.push({ state: "IMAGE_KEYBOARD", viewport: viewport.id, pass: titleFocused && initialCounter && advanced && returned && focusReturned, initialFocus: image.initialFocus, initialCounter, advanced, returned, focusReturned });
    }
    if (viewport.id === "1440x900") screenshots.push(await screenshot(page, "1440-pick.png"));

    results.push({ state: "ERROR_CHANNELS", viewport: viewport.id, pass: errorsHealthy(errors), errors: structuredClone(errors) });
    await session.context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C1A1InteractionTruthBrowserV1", browser: executablePath, records: results.length, failures: failures.length, screenshots, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), screenshots }, null, 2));
if (failures.length) process.exitCode = 1;
