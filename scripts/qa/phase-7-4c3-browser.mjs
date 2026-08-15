import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c3");
const reviewOutput = path.join(output, "review");
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
const accounts = { empty: "stage3-account-fk-02", flipkart: "stage3-account-fk-01", projection: "stage4-account-pick-projection" };
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
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.route(/https:\/\/(invalid\.example\.invalid|example\.invalid)\//, (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-image" }));
  const page = await context.newPage();
  const errors = monitor(page);
  const user = credential(scenario);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(user.username);
  await page.locator('input[name="password"]').fill(user.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }), page.locator("form").first().evaluate((form) => form.requestSubmit())]);
  return { context, page, errors };
}

async function selectAccount(page, accountId) {
  await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
  await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]);
}

async function openMark(page, route = "/work/mark") {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").filter({ hasText: /^Marking$/ }).waitFor({ timeout: 20_000 });
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, document.documentElement.scrollHeight); await new Promise((resolve) => setTimeout(resolve, 50)); scrollTo(0, 0); });
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !element.disabled; };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select,#app-shell-main summary")].filter(visible);
    return {
      cards: document.querySelectorAll("[data-responsive-work-card]").length,
      guidance: document.querySelectorAll("[data-marking-guidance]").length,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      currentPages: document.querySelectorAll('[aria-current="page"]').length,
      rawRouteCodes: [...document.body.innerText.matchAll(/\bPICK_(?:PACK|MARK_PACK|ASSEMBLE_PACK|MARK_ASSEMBLE_PACK)\b/g)].map((match) => match[0]),
      text: document.body.innerText,
      undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 80), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44),
    };
  });
}

const errorsHealthy = (errors) => Object.values(errors).every((items) => items.length === 0);
const healthy = (inspection, errors, width) => inspection.clientWidth === inspection.scrollWidth && inspection.currentPages === (width >= 1280 ? 1 : 0) && inspection.rawRouteCodes.length === 0 && inspection.undersized.length === 0 && errorsHealthy(errors);
async function screenshot(page, name) { const target = path.join(reviewOutput, name); await page.screenshot({ path: target, fullPage: true, animations: "disabled", caret: "hide" }); return path.relative(root, target); }

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
const screenshots = [];
try {
  for (const viewport of viewports) {
    const owner = await session(browser, viewport);
    await selectAccount(owner.page, accounts.flipkart);

    await openMark(owner.page);
    const chooser = await inspect(owner.page);
    results.push({ state: "SOURCE_CHOOSER", viewport: viewport.id, pass: healthy(chooser, owner.errors, viewport.width) && chooser.cards === 0 && chooser.text.includes("Customer Orders") && chooser.text.includes("Consignments") && chooser.text.includes("Choose Customer Orders or Consignments") && chooser.text.includes("Open work") && chooser.text.includes("Required quantity") && chooser.text.includes("Assigned to me"), inspection: chooser, errors: structuredClone(owner.errors) });

    await openMark(owner.page, "/work/mark?source=ORDER");
    const order = await inspect(owner.page);
    results.push({ state: "ORDER_MARK", viewport: viewport.id, pass: healthy(order, owner.errors, viewport.width) && order.cards > 0 && order.guidance > 0 && order.text.includes("STAGE-MARKING-MASTER-001") && order.text.includes("Marking Completed") && order.text.toUpperCase().includes("POWER") && order.text.toUpperCase().includes("SPEED"), inspection: order, errors: structuredClone(owner.errors) });

    await openMark(owner.page, "/work/mark?source=CONSIGNMENT");
    const consignment = await inspect(owner.page);
    results.push({ state: "CONSIGNMENT_MARK", viewport: viewport.id, pass: healthy(consignment, owner.errors, viewport.width) && consignment.cards > 0 && consignment.guidance > 0 && consignment.text.includes("Saved marking instructions unavailable") && consignment.text.includes("Use the approved paper template") && consignment.text.includes("Work paused") && consignment.text.includes("Synthetic long marking product title"), inspection: consignment, errors: structuredClone(owner.errors) });
    if (viewport.id === "390x844") screenshots.push(await screenshot(owner.page, "390-consignment-mark.png"));
    if (viewport.id === "1440x900") screenshots.push(await screenshot(owner.page, "1440-consignment-mark.png"));

    if (viewport.id === "390x844") {
      const unresolved = owner.page.locator("[data-responsive-work-card]", { hasText: "Synthetic C3A Mark with Pack and Assembly choices" }).first();
      const unresolvedButton = unresolved.getByRole("button", { name: "Marking Completed" });
      await unresolvedButton.focus();
      const focusVisible = await unresolvedButton.evaluate((element) => element.matches(":focus-visible") && getComputedStyle(element).outlineStyle !== "none");
      await unresolvedButton.click();
      const routeDialog = owner.page.locator('[data-worker-overlay="PROCESS_FLOW"] [role="dialog"]');
      await routeDialog.waitFor();
      const routeText = await routeDialog.innerText();
      const focusInDialog = await owner.page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
      await owner.page.keyboard.press("Escape");
      const focusReturned = await unresolvedButton.evaluate((element) => document.activeElement === element);
      results.push({ state: "UNRESOLVED_ROUTE", viewport: viewport.id, pass: focusVisible && focusInDialog && focusReturned && routeText.includes("Send to Pack") && routeText.includes("Send to Assembly") && !/PICK_MARK/.test(routeText), focusVisible, focusInDialog, focusReturned, routeText });

      const assembly = owner.page.locator("[data-responsive-work-card]", { hasText: "Synthetic C3A Mark with preselected Assembly" }).first();
      const assemblyAction = assembly.getByRole("button", { name: "Marking Completed" });
      const assemblyType = await assemblyAction.getAttribute("type");
      const assemblyText = await assembly.innerText();
      results.push({ state: "PRESELECTED_ASSEMBLY", viewport: viewport.id, pass: assemblyType === "submit" && assemblyText.includes("Pick") && assemblyText.includes("Mark") && assemblyText.includes("Assembly") && assemblyText.includes("Pack") && !assemblyText.includes("Send to Pack") });

      const gallery = owner.page.locator("[data-responsive-work-card]", { hasText: "STAGE-C3B-GALLERY-MARK" }).first();
      const partialTrigger = gallery.getByRole("button", { name: "Partial Quantity" });
      await partialTrigger.click();
      const partial = owner.page.locator('[data-worker-overlay="PARTIAL_QUANTITY"] [role="dialog"]');
      await partial.waitFor();
      const quantity = partial.locator('input[name="targetQuantity"]');
      const bounds = { min: await quantity.getAttribute("min"), max: await quantity.getAttribute("max") };
      await owner.page.keyboard.press("Escape");
      await gallery.getByRole("button", { name: "Details" }).click();
      const details = owner.page.locator('[data-worker-overlay="DETAILS"] [role="dialog"]');
      await details.waitFor();
      const detailsText = await details.innerText();
      await owner.page.keyboard.press("Escape");
      results.push({ state: "PARTIAL_AND_DETAILS", viewport: viewport.id, pass: bounds.min === "4" && bounds.max === "7" && detailsText.includes("Master Design ID") && detailsText.includes("Design / asset") && detailsText.includes("Dimensions") && detailsText.includes("Open full details"), bounds, detailsText });

      const problem = owner.page.locator("[data-responsive-work-card]", { hasText: "STAGE-C3B-PROBLEM-MARK" }).first();
      const problemButtons = await problem.locator("[data-work-actions] button").allTextContents();
      await problem.getByRole("button", { name: "Open Problem" }).click();
      const problemDialog = owner.page.locator('[data-worker-overlay="PROBLEM"] [role="dialog"]');
      await problemDialog.waitFor();
      await problemDialog.getByText("Work paused", { exact: true }).waitFor();
      const problemText = await problemDialog.innerText();
      await owner.page.keyboard.press("Escape");
      results.push({ state: "PROBLEM", viewport: viewport.id, pass: problemButtons.every((label) => ["Open Problem", "Details"].includes(label.trim())) && !problemButtons.some((label) => /Completed|Partial/.test(label)) && problemText.includes("Work paused") });

      await openMark(owner.page, "/work/marking?q=STAGE-C3B-GALLERY-MARK");
      const individual = owner.page.locator("[data-responsive-work-card]").first();
      const galleryCount = await individual.locator("[data-work-gallery]").getAttribute("data-image-count");
      const imageTrigger = individual.getByRole("button", { name: /Open large image preview/ });
      await imageTrigger.click();
      const imageDialog = owner.page.locator('[data-worker-overlay="IMAGE"] [role="dialog"]');
      await imageDialog.waitFor();
      await owner.page.keyboard.press("ArrowRight");
      const imageText = await imageDialog.innerText();
      await owner.page.keyboard.press("Escape");
      const imageFocusReturned = await imageTrigger.evaluate((element) => document.activeElement === element);
      results.push({ state: "IMAGE_VIEWER", viewport: viewport.id, pass: Number(galleryCount) >= 3 && imageText.includes("Image 2 of") && imageFocusReturned, galleryCount, imageText, imageFocusReturned });
    }
    await owner.context.close();
  }

  const readOnly = await session(browser, { width: 390, height: 844 }, "VIEW_ALL");
  await openMark(readOnly.page, "/work/mark?source=CONSIGNMENT");
  const readOnlyInspection = await inspect(readOnly.page);
  const readOnlyButtons = await readOnly.page.locator("[data-work-actions] button").allTextContents();
  results.push({ state: "READ_ONLY", viewport: "390x844", pass: healthy(readOnlyInspection, readOnly.errors, 390) && readOnlyInspection.text.includes("Read-only work view") && readOnlyButtons.every((label) => ["Details", "Open Problem"].includes(label.trim())) && !readOnlyButtons.some((label) => /Completed|Partial|^Problem$/.test(label)), inspection: readOnlyInspection, buttons: readOnlyButtons, errors: readOnly.errors });
  await readOnly.context.close();

  const marker = await session(browser, { width: 390, height: 844 }, "MARKER");
  await openMark(marker.page, "/work/mark?source=CONSIGNMENT");
  const markerInspection = await inspect(marker.page);
  results.push({ state: "MARKER_ROLE", viewport: "390x844", pass: healthy(markerInspection, marker.errors, 390) && markerInspection.text.includes("Marking Completed") && markerInspection.text.includes("Details"), inspection: markerInspection, errors: marker.errors });
  await marker.context.close();

  const noMark = await session(browser, { width: 390, height: 844 }, "IMPORT_MANAGER");
  await noMark.page.goto(`${base}/work/mark`, { waitUntil: "domcontentloaded" });
  const noMarkPath = new URL(noMark.page.url()).pathname;
  results.push({ state: "NO_MARK_PERMISSION", viewport: "390x844", pass: noMarkPath !== "/work/mark" && !/Marking Completed/.test(await noMark.page.locator("body").innerText()), path: noMarkPath, errors: noMark.errors });
  await noMark.context.close();

  const owner = await session(browser, { width: 390, height: 844 });
  await selectAccount(owner.page, accounts.empty);
  await openMark(owner.page);
  const empty = await inspect(owner.page);
  results.push({ state: "EMPTY", viewport: "390x844", pass: healthy(empty, owner.errors, 390) && empty.cards === 0 && empty.text.includes("No active marking work"), inspection: empty, errors: structuredClone(owner.errors) });
  await selectAccount(owner.page, accounts.projection);
  await openMark(owner.page);
  const projection = await inspect(owner.page);
  results.push({ state: "PROJECTION_UNAVAILABLE", viewport: "390x844", pass: healthy(projection, owner.errors, 390) && projection.cards === 0 && projection.text.includes("Marking queue temporarily unavailable") && projection.text.includes("Worker actions are unavailable"), inspection: projection, errors: structuredClone(owner.errors) });
  await owner.context.close();
} finally {
  await browser.close();
}

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C3MarkBrowserV1", browser: executablePath, records: results.length, failures: failures.length, screenshots, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), screenshots }, null, 2));
if (failures.length) process.exitCode = 1;
