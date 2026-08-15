import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c1a");
const reviewOutput = path.join(output, "owner-review");
const credentialsPath = path.join(root, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");
const viewports = [{ id: "360x800", width: 360, height: 800 }, { id: "390x844", width: 390, height: 844 }, { id: "430x932", width: 430, height: 932 }, { id: "768x1024", width: 768, height: 1024 }, { id: "1024x768", width: 1024, height: 768 }, { id: "1440x900", width: 1440, height: 900 }];
const reflows = [{ id: "390@200%", width: 195, height: 422 }, { id: "768@200%", width: 384, height: 512 }, { id: "1024@200%", width: 512, height: 384 }, { id: "1440@200%", width: 720, height: 450 }];
const accountId = "stage3-account-fk-01";
const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
const users = Object.fromEntries(credentials.users.map((entry) => [entry.scenario, entry]));
for (const scenario of ["OWNER", "PICKER", "C1_PICK_READ_ONLY"]) if (!users[scenario]) throw new Error(`Missing synthetic credential ${scenario}.`);
await mkdir(reviewOutput, { recursive: true });

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function session(browser, viewport, scenario) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route("https://invalid.example.invalid/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-invalid-image" }));
  const page = await context.newPage(), errors = monitor(page), credential = users[scenario];
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(credential.username);
  await page.locator('input[name="password"]').fill(credential.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }), page.locator("form").first().evaluate((form) => form.requestSubmit())]);
  if (scenario === "OWNER") {
    await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
    await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
    await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]);
  }
  return { context, page, errors };
}

async function open(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-responsive-work-card]").first().waitFor({ timeout: 20_000 });
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, document.documentElement.scrollHeight); await new Promise((resolve) => setTimeout(resolve, 50)); scrollTo(0, 0); });
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; };
    const cards = [...document.querySelectorAll("[data-responsive-work-card]")];
    const controls = cards.flatMap((card) => [...card.querySelectorAll("button,a,input:not([type=hidden]),select,textarea,summary")].filter(visible));
    const undersized = controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: element.textContent?.trim().slice(0, 60), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      cardCount: cards.length,
      cardHeights: cards.slice(0, 6).map((card) => ({ stage: card.getAttribute("data-stage"), status: card.getAttribute("data-status"), height: card.getBoundingClientRect().height, quantityHeight: card.querySelector("[data-quantity-panel]")?.getBoundingClientRect().height ?? 0, actionHeight: card.querySelector("[data-work-actions]")?.getBoundingClientRect().height ?? 0, image: card.querySelector("[data-work-gallery]")?.getBoundingClientRect().width ?? 0 })),
      hasProcessFlow: cards.every((card) => Boolean(card.querySelector("[data-process-flow]"))),
      duplicateDisclosure: /Identifiers and work context|Identifiers and route context/.test(document.body.innerText),
      rawRoute: /\bPICK_(PACK|MARK_PACK|ASSEMBLE_PACK|MARK_ASSEMBLE_PACK)\b/.test(document.body.innerText),
      undersized,
    };
  });
}

function healthy(errors) { return Object.values(errors).every((items) => items.length === 0); }
function basePass(result, errors) { return result.cardCount > 0 && result.clientWidth === result.scrollWidth && result.undersized.length === 0 && result.hasProcessFlow && !result.duplicateDisclosure && !result.rawRoute && healthy(errors); }

async function overlayEvidence(page, trigger, expectedKind, viewportWidth) {
  const url = page.url();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await trigger.click();
  const root = page.locator(`[data-worker-overlay="${expectedKind}"]`), dialog = root.getByRole("dialog");
  await dialog.waitFor();
  const evidence = await page.evaluate(({ expectedKind, viewportWidth }) => {
    const root = document.querySelector(`[data-worker-overlay="${expectedKind}"]`), panel = root?.querySelector('[role="dialog"]'), rect = panel?.getBoundingClientRect();
    return { inert: document.querySelector("[data-app-shell-root]")?.inert === true, modal: panel?.getAttribute("aria-modal"), focusInDialog: Boolean(document.activeElement?.closest('[role="dialog"]')), bottomSheet: viewportWidth >= 768 ? true : Boolean(rect && Math.abs(rect.bottom - innerHeight) < 2), desktopDrawer: expectedKind !== "DETAILS" || viewportWidth < 768 ? true : Boolean(rect && Math.abs(rect.right - innerWidth) < 2), overflow: Boolean(rect && rect.width <= innerWidth + 0.5) };
  }, { expectedKind, viewportWidth });
  await page.keyboard.press("Shift+Tab");
  evidence.shiftTabContained = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  await page.keyboard.press("Tab");
  evidence.tabContained = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  await page.keyboard.press("Escape");
  await root.waitFor({ state: "detached" });
  evidence.focusReturned = await trigger.evaluate((element) => document.activeElement === element || (!element.isConnected && document.activeElement?.id === "app-shell-main"));
  evidence.urlStable = page.url() === url;
  evidence.inertRemoved = await page.evaluate(() => document.querySelector("[data-app-shell-root]")?.inert === false);
  evidence.pass = Object.values(evidence).every(Boolean);
  return evidence;
}

async function capture(page, name) { const file = path.join(reviewOutput, name); await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" }); return path.relative(root, file); }

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [], screenshots = [], density = [];
try {
  for (const viewport of viewports) {
    const owner = await session(browser, viewport, "OWNER");
    for (const [state, route] of [["PICK_READY", "/work/pick?source=ORDER"], ["MARK_READY", "/work/mark?source=ORDER"], ["ASSEMBLY_READY", "/work/assemble?source=ORDER"], ["PACK_READY", "/work/pack?source=ORDER"]]) {
      await open(owner.page, route);
      const inspection = await inspect(owner.page);
      results.push({ state, viewport: viewport.id, pass: basePass(inspection, owner.errors), inspection, errors: structuredClone(owner.errors) });
      if (state === "PICK_READY") density.push({ viewport: viewport.id, cards: inspection.cardHeights });
    }
    await open(owner.page, "/work/pick?source=ORDER");
    const card = owner.page.locator("[data-responsive-work-card]").first();
    const process = await overlayEvidence(owner.page, card.getByRole("button", { name: /Complete Pick/ }).first(), "PROCESS_FLOW", viewport.width);
    results.push({ state: "PROCESS_FLOW", viewport: viewport.id, pass: process.pass, evidence: process, errors: structuredClone(owner.errors) });
    const details = await overlayEvidence(owner.page, card.getByRole("button", { name: "Details" }).first(), "DETAILS", viewport.width);
    results.push({ state: "DETAILS", viewport: viewport.id, pass: details.pass, evidence: details, errors: structuredClone(owner.errors) });
    if (viewport.id === "390x844" || viewport.id === "1440x900") {
      screenshots.push(await capture(owner.page, viewport.id === "390x844" ? "390-pick-ready.png" : "1440-pick.png"));
      await card.getByRole("button", { name: /Complete Pick/ }).first().click(); await owner.page.getByRole("dialog").waitFor(); screenshots.push(await capture(owner.page, viewport.id === "390x844" ? "390-process-flow.png" : "1440-process-flow.png")); await owner.page.keyboard.press("Escape");
      await card.getByRole("button", { name: "Details" }).first().click(); await owner.page.getByRole("dialog").waitFor(); screenshots.push(await capture(owner.page, viewport.id === "390x844" ? "390-details.png" : "1440-details.png")); await owner.page.keyboard.press("Escape");
    }
    if (viewport.id === "390x844" || viewport.id === "1440x900") {
      let interactionCard = card;
      let partialButton = owner.page.getByRole("button", { name: "Partial Quantity" }).first();
      if (!await partialButton.count()) {
        await open(owner.page, "/work/pick?source=CONSIGNMENT");
        interactionCard = owner.page.locator("[data-responsive-work-card]").filter({ has: owner.page.getByRole("button", { name: "Partial Quantity" }) }).first();
        partialButton = interactionCard.getByRole("button", { name: "Partial Quantity" }).first();
      }
      if (!await partialButton.count()) throw new Error("Synthetic Pick fixture has no card eligible for Partial Quantity.");
      const partialEvidence = await overlayEvidence(owner.page, partialButton, "PARTIAL_QUANTITY", viewport.width);
      results.push({ state: "PARTIAL_QUANTITY", viewport: viewport.id, pass: partialEvidence.pass, evidence: partialEvidence, errors: structuredClone(owner.errors) });
      if (viewport.id === "390x844") { await partialButton.click(); await owner.page.getByRole("dialog").waitFor(); screenshots.push(await capture(owner.page, "390-partial-quantity.png")); await owner.page.keyboard.press("Escape"); }
      const problemButton = interactionCard.getByRole("button", { name: "Problem" }).first();
      const problemEvidence = await overlayEvidence(owner.page, problemButton, "PROBLEM", viewport.width);
      results.push({ state: "PROBLEM_QUICK_ACTION", viewport: viewport.id, pass: problemEvidence.pass, evidence: problemEvidence, errors: structuredClone(owner.errors) });
      if (viewport.id === "390x844") { await problemButton.click(); await owner.page.getByRole("dialog").waitFor(); await owner.page.getByText(/Loading exact work members/).waitFor({ state: "detached", timeout: 10_000 }).catch(() => {}); screenshots.push(await capture(owner.page, "390-problem.png")); await owner.page.keyboard.press("Escape");
        const imageTrigger = owner.page.getByRole("button", { name: /Open large image preview/ }).first(); if (await imageTrigger.count()) { const imageEvidence = await overlayEvidence(owner.page, imageTrigger, "IMAGE", viewport.width); results.push({ state: "IMAGE_PREVIEW", viewport: viewport.id, pass: imageEvidence.pass, evidence: imageEvidence, errors: structuredClone(owner.errors) }); await imageTrigger.click(); await owner.page.getByRole("dialog").waitFor(); screenshots.push(await capture(owner.page, "390-image-preview.png")); await owner.page.keyboard.press("Escape"); }
      }
    }
    for (const [state, route] of [["MARK_TASK_READY", "/work/marking"], ["ASSEMBLY_TASK_READY", "/work/consignments/assemble"], ["PACK_TASK_READY", "/work/consignments/pack"]]) {
      await open(owner.page, route); const inspection = await inspect(owner.page); results.push({ state, viewport: viewport.id, pass: basePass(inspection, owner.errors), inspection, errors: structuredClone(owner.errors) });
    }
    await owner.context.close();

    const picker = await session(browser, viewport, "PICKER");
    for (const [state, route] of [["CONSIGNMENT_READY", "/work/consignments/pick"], ["CONSIGNMENT_PROBLEM", "/work/consignments/pick?status=problem"]]) {
      await open(picker.page, route); const inspection = await inspect(picker.page); results.push({ state, viewport: viewport.id, pass: basePass(inspection, picker.errors), inspection, errors: structuredClone(picker.errors) });
    }
    await picker.context.close();

    const readonly = await session(browser, viewport, "C1_PICK_READ_ONLY");
    await open(readonly.page, "/work/consignments/pick"); const readOnlyInspection = await inspect(readonly.page); const onlyDetails = await readonly.page.locator("[data-work-actions] button").evaluateAll((items) => items.every((item) => item.textContent?.trim() === "Details"));
    results.push({ state: "CONSIGNMENT_READ_ONLY", viewport: viewport.id, pass: basePass(readOnlyInspection, readonly.errors) && onlyDetails, inspection: readOnlyInspection, errors: structuredClone(readonly.errors) });
    await readonly.context.close();
  }

  for (const reflow of reflows) {
    const picker = await session(browser, { width: reflow.width, height: reflow.height }, "PICKER");
    await open(picker.page, "/work/consignments/pick"); const inspection = await inspect(picker.page); results.push({ state: "REFLOW_200_PERCENT", viewport: reflow.id, pass: basePass(inspection, picker.errors), inspection, errors: structuredClone(picker.errors) }); await picker.context.close();
  }
} finally { await browser.close(); }

const failures = results.filter((item) => !item.pass || !healthy(item.errors));
const report = { schema: "Phase7_4C1AWorkerInteractionsBrowserV1", browser: executablePath, records: results.length, failures: failures.length, density, screenshots, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`), screenshots }, null, 2));
if (failures.length) process.exitCode = 1;
