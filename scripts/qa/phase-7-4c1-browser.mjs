import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c1");
const reviewOutput = path.join(output, "owner-review");
const impeccableOutput = path.join(root, ".impeccable", "review");
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
const reflows = [
  { id: "390@200%", width: 195, height: 422 },
  { id: "768@200%", width: 384, height: 512 },
  { id: "1024@200%", width: 512, height: 384 },
  { id: "1440@200%", width: 720, height: 450 },
];
const accountId = "stage3-account-fk-01";
const credentials = JSON.parse(await readFile(credentialsPath, "utf8"));
const users = Object.fromEntries(credentials.users.map((entry) => [entry.scenario, entry]));
for (const scenario of ["OWNER", "PICKER", "C1_PICK_READ_ONLY"]) if (!users[scenario]) throw new Error(`Missing synthetic credential ${scenario}.`);
await mkdir(reviewOutput, { recursive: true });
await mkdir(impeccableOutput, { recursive: true });

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); });
  page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

async function newPage(browser, viewport, scenario) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.route("https://invalid.example.invalid/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-invalid-image" }));
  const page = await context.newPage();
  const errors = monitor(page);
  const credential = users[scenario];
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(credential.username);
  await page.locator('input[name="password"]').fill(credential.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit()),
  ]);
  if (scenario === "OWNER") await selectAccount(page);
  return { context, page, errors };
}

async function selectAccount(page) {
  await page.goto(`${base}/accounts`, { waitUntil: "domcontentloaded" });
  await page.locator(`input[name="accountId"][value="${accountId}"]`).check();
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole("button", { name: "Select account" }).click(),
  ]);
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    await document.fonts.ready;
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    for (let y = 0; y < height; y += Math.max(240, Math.floor(innerHeight * 0.75))) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    scrollTo(0, 0);
    for (const animation of document.getAnimations()) {
      try { animation.finish(); } catch { animation.pause(); }
    }
  });
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const cards = [...document.querySelectorAll("[data-responsive-work-card]")];
    const interactive = cards.flatMap((card) => [...card.querySelectorAll("a,button,input:not([type=hidden]),select,textarea,summary")].filter(visible));
    const undersized = interactive.map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, text: element.textContent?.trim().slice(0, 80) ?? "", width: rect.width, height: rect.height };
    }).filter((item) => item.width < 44 || item.height < 44);
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      cardCount: cards.length,
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        const media = card.querySelector("[data-work-gallery]")?.getBoundingClientRect() ?? card.querySelector("img")?.parentElement?.getBoundingClientRect() ?? card.querySelector("[title]")?.getBoundingClientRect();
        const image = card.querySelector("img");
        const state = card.querySelector("[data-work-state]");
        const actions = card.querySelector("[data-work-actions]");
        return {
          source: card.getAttribute("data-source"),
          stage: card.getAttribute("data-stage"),
          status: card.getAttribute("data-status"),
          width: rect.width,
          text: card.textContent?.replace(/\s+/g, " ").trim() ?? "",
          actionMode: card.querySelector("[data-action-mode]")?.getAttribute("data-action-mode"),
          actions: [...card.querySelectorAll("[data-work-actions] a,[data-work-actions] button")].filter(visible).map((item) => item.textContent?.trim()),
          details: [...card.querySelectorAll('a[href*="/work/"]')].map((item) => item.getAttribute("href")).filter((href) => href?.includes("groups") || href?.includes("consignments/items")),
          media: media ? { width: media.width, height: media.height } : null,
          imageLoaded: Boolean(image?.complete && image.naturalWidth > 0),
          stateBeforeActions: Boolean(state && actions && (state.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING)),
          progress: card.querySelector('[role="progressbar"]') ? {
            now: card.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"),
            max: card.querySelector('[role="progressbar"]')?.getAttribute("aria-valuemax"),
          } : null,
        };
      }),
      undersized,
      invalidCopy: /\b(undefined|null|Invalid Date)\b/.test(document.body.innerText),
      focusables: interactive.length,
    };
  });
}

function healthy(errors) {
  return Object.values(errors).every((items) => items.length === 0);
}

function basePass(inspection, errors) {
  return inspection.clientWidth === inspection.scrollWidth
    && inspection.clientWidth === inspection.bodyScrollWidth
    && inspection.cardCount > 0
    && inspection.undersized.length === 0
    && !inspection.invalidCopy
    && healthy(errors);
}

async function open(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-responsive-work-card]").first().waitFor({ timeout: 20_000 });
  await settle(page);
  return inspect(page);
}

async function focusEvidence(page) {
  const target = page.locator("[data-responsive-work-card] a,[data-responsive-work-card] button,[data-responsive-work-card] summary").filter({ visible: true }).first();
  await target.focus();
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { visible: element.matches(":focus-visible"), outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}` };
  });
}

async function dialogEvidence(page) {
  const trigger = page.getByRole("button", { name: /Complete Pick|choose route/ }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const initial = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim());
  await page.keyboard.press("Shift+Tab");
  const shiftContained = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  await page.keyboard.press("Tab");
  const tabContained = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const payload = await dialog.locator('input[type="hidden"]').evaluateAll((items) => items.map((item) => item.getAttribute("name")));
  await page.keyboard.press("Escape");
  const returned = await trigger.evaluate((element) => document.activeElement === element);
  return { initial, shiftContained, tabContained, returned, payload, pass: Boolean(initial) && shiftContained && tabContained && returned };
}

async function dialogStateEvidence(page) {
  const result = { savedOverride: false, systemFallback: false, missingInstructions: false };
  const savedCard = page.locator('[data-responsive-work-card][data-stage="PICK"]').filter({ hasText: "PICK_PACK" }).first();
  if (await savedCard.count()) {
    await savedCard.getByRole("button", { name: "Complete Pick" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send to Marking" }).click();
    result.savedOverride = await page.getByRole("dialog").locator('select[name="routeReason"]').isVisible();
    await page.keyboard.press("Escape");
  }
  const fallbackCard = page.locator('[data-responsive-work-card][data-stage="PICK"]').filter({ hasText: "System fallback" }).first();
  if (await fallbackCard.count()) {
    await fallbackCard.getByRole("button", { name: "Complete Pick" }).click();
    result.systemFallback = await page.getByRole("dialog").getByText("System fallback — Direct to Pack", { exact: true }).isVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Send to Marking" }).click();
    result.missingInstructions = await page.getByRole("dialog").getByText(/Saved instructions are unavailable/).isVisible();
    await page.keyboard.press("Escape");
  }
  return { ...result, pass: Object.values(result).every(Boolean) };
}

async function liveEvidence(page) {
  const cards = page.locator('[data-responsive-work-card][data-stage="PICK"]');
  const before = await cards.count();
  const first = cards.first();
  const details = first.getByRole("link", { name: "Details" });
  await details.focus();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("work-change", { detail: { groupKey: "unrelated-c1-group", stage: "PICK", eventType: "TASK_UPDATED" } })));
  await page.waitForTimeout(100);
  const unrelatedStable = await details.evaluate((element) => document.activeElement === element) && await cards.count() === before;
  const href = await details.getAttribute("href");
  const groupKey = href?.match(/\/work\/groups\/pick\/([^?]+)/)?.[1];
  let changedStable = false;
  let removed = false;
  if (groupKey) {
    const response = page.waitForResponse((item) => item.url().includes(`/api/work/groups/pick/${groupKey}`), { timeout: 10_000 });
    await page.evaluate(({ groupKey }) => window.dispatchEvent(new CustomEvent("work-change", { detail: { groupKey, stage: "PICK", eventType: "TASK_UPDATED" } })), { groupKey });
    await response;
    changedStable = await cards.count() === before;
    await page.evaluate(({ groupKey }) => window.dispatchEvent(new CustomEvent("work-change", { detail: { groupKey, stage: "PICK", eventType: "STAGE_COMPLETED" } })), { groupKey });
    await page.waitForTimeout(50);
    removed = await cards.count() === before - 1;
  }
  return { before, unrelatedStable, changedStable, removed, pass: before > 1 && unrelatedStable && changedStable && removed };
}

async function capture(page, filename, impeccableName) {
  await page.evaluate(() => scrollTo(0, 0));
  const file = path.join(reviewOutput, filename);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide" });
  if (impeccableName) await page.screenshot({ path: path.join(impeccableOutput, impeccableName), fullPage: true, animations: "disabled", caret: "hide" });
  return path.relative(root, file);
}

const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
try {
  for (const viewport of viewports) {
    const ownerSession = await newPage(browser, viewport, "OWNER");
    for (const [stage, route, primary] of [
      ["PICK", "/work/pick?source=ORDER", "Complete Pick"],
      ["MARK", "/work/mark?source=ORDER", "Marking Completed"],
      ["ASSEMBLE", "/work/assemble?source=ORDER", "Assembly Completed"],
      ["PACK", "/work/pack?source=ORDER", "Complete Pack"],
    ]) {
      const inspection = await open(ownerSession.page, route);
      const stageCards = inspection.cards.filter((card) => card.stage === stage);
      const pass = basePass(inspection, ownerSession.errors)
        && stageCards.length > 0
        && stageCards.every((card) => card.source === "ORDER" && card.media && card.media.width <= 112.5 && card.media.height <= 112.5)
        && stageCards.every((card) => card.stateBeforeActions)
        && stageCards.some((card) => card.actions.includes(primary))
        && stageCards.every((card) => card.details.length > 0);
      results.push({ state: `GROUPED_${stage}`, viewport: viewport.id, pass, inspection, errors: structuredClone(ownerSession.errors) });
      if (stage === "PICK" && viewport.id === "390x844") await capture(ownerSession.page, "grouped-pick-mobile.png", "mobile.png");
      if (stage === "PICK" && viewport.id === "1440x900") await capture(ownerSession.page, "grouped-pick-desktop.png", "desktop.png");
      if (stage === "PICK" && (viewport.id === "390x844" || viewport.id === "1440x900")) {
        const focus = await focusEvidence(ownerSession.page);
        const dialog = await dialogEvidence(ownerSession.page);
        const dialogStates = await dialogStateEvidence(ownerSession.page);
        results.push({ state: "GROUPED_FOCUS_DIALOG", viewport: viewport.id, pass: focus.visible && focus.outline.startsWith("3px solid") && dialog.pass && dialogStates.pass, focus, dialog, dialogStates, errors: structuredClone(ownerSession.errors) });
        if (viewport.id === "390x844") {
          await ownerSession.page.getByRole("button", { name: /Complete Pick/ }).first().click();
          await ownerSession.page.getByRole("dialog").waitFor();
          await capture(ownerSession.page, "route-dialog-mobile.png", "dialog-mobile.png");
          await ownerSession.page.keyboard.press("Escape");
        }
      }
    }

    for (const [state, route, expected] of [
      ["TASK_MARK_READY", "/work/marking", "Marking instructions"],
      ["TASK_ASSEMBLY_READY_MANUAL", "/work/consignments/assemble", "Manual route instructions need supervisor confirmation"],
      ["TASK_PACK_READY", "/work/consignments/pack", "Package quantity"],
    ]) {
      const inspection = await open(ownerSession.page, route);
      const pass = basePass(inspection, ownerSession.errors) && inspection.cards.some((card) => card.text.includes(expected) && card.details.length > 0);
      results.push({ state, viewport: viewport.id, pass, inspection, errors: structuredClone(ownerSession.errors) });
    }
    await ownerSession.context.close();

    const pickerSession = await newPage(browser, viewport, "PICKER");
    await open(pickerSession.page, "/work/consignments/pick");
    const longCardElement = pickerSession.page.locator("[data-responsive-work-card]").filter({ hasText: "very long product title" }).first();
    await longCardElement.scrollIntoViewIfNeeded();
    await longCardElement.locator("img").waitFor({ state: "attached", timeout: 5_000 });
    await pickerSession.page.waitForFunction((card) => {
      const image = card.querySelector("img");
      return Boolean(image?.complete && image.naturalWidth > 0);
    }, await longCardElement.elementHandle(), { timeout: 5_000 });
    const ready = await inspect(pickerSession.page);
    const longCard = ready.cards.find((card) => card.text.includes("very long product title"));
    const readyPass = basePass(ready, pickerSession.errors)
      && Boolean(longCard)
      && longCard?.source === "CONSIGNMENT"
      && longCard?.stage === "PICK"
      && longCard?.status === "READY"
      && longCard?.actionMode === "ready"
      && longCard?.imageLoaded
      && longCard?.stateBeforeActions
      && longCard?.media && longCard.media.width <= 112.5 && longCard.media.height <= 112.5
      && ready.cards.some((card) => card.text.includes("No image"))
      && longCard?.details.some((href) => href?.startsWith("/work/consignments/items/"));
    results.push({ state: "TASK_PICK_READY_LONG", viewport: viewport.id, pass: Boolean(readyPass), inspection: ready, errors: structuredClone(pickerSession.errors) });
    const problem = await open(pickerSession.page, "/work/consignments/pick?status=problem");
    if (viewport.id === "390x844") await pickerSession.page.waitForTimeout(5_600);
    const problemSettled = viewport.id === "390x844" ? await inspect(pickerSession.page) : problem;
    const problemPass = basePass(problemSettled, pickerSession.errors) && problemSettled.cards.some((card) => card.status === "PROBLEM" && card.actionMode === "problem" && card.stateBeforeActions && card.text.includes("QUANTITY SHORT") && !card.actions.some((action) => /Complete|Start|Save/.test(action ?? ""))) && (viewport.id !== "390x844" || problemSettled.cards.some((card) => card.text.includes("Image unavailable")));
    results.push({ state: "TASK_PICK_PROBLEM", viewport: viewport.id, pass: problemPass, inspection: problemSettled, errors: structuredClone(pickerSession.errors) });
    if (viewport.id === "390x844") await capture(pickerSession.page, "task-problem-mobile.png", "problem-mobile.png");
    const completed = await open(pickerSession.page, "/work/consignments/pick?status=completed");
    const completedPass = basePass(completed, pickerSession.errors) && completed.cards.some((card) => card.status === "COMPLETED" && card.actionMode === "completed" && card.stateBeforeActions && card.text.includes("Work completed") && !card.actions.some((action) => /Complete|Start|Save/.test(action ?? "")));
    results.push({ state: "TASK_PICK_COMPLETED", viewport: viewport.id, pass: completedPass, inspection: completed, errors: structuredClone(pickerSession.errors) });
    if (viewport.id === "390x844") {
      await open(pickerSession.page, "/work/consignments/pick");
      const detailLink = pickerSession.page.locator('[data-responsive-work-card]').filter({ hasText: "very long product title" }).getByRole("link", { name: "Details" });
      const href = await detailLink.getAttribute("href");
      if (href) {
        await Promise.all([pickerSession.page.waitForURL((url) => url.pathname === href), detailLink.click()]);
        const navigated = pickerSession.page.url().endsWith(href);
        await pickerSession.page.goBack({ waitUntil: "domcontentloaded" });
        results.push({ state: "TASK_DETAILS_NAVIGATION", viewport: viewport.id, pass: navigated && pickerSession.page.url().includes("/work/consignments/pick"), href, errors: structuredClone(pickerSession.errors) });
      }
    }
    await pickerSession.context.close();

    const readonlySession = await newPage(browser, viewport, "C1_PICK_READ_ONLY");
    const readonly = await open(readonlySession.page, "/work/consignments/pick");
    const readOnlyCard = readonly.cards.find((card) => card.text.includes("Read-only work view"));
    const readOnlyPass = basePass(readonly, readonlySession.errors) && Boolean(readOnlyCard) && readOnlyCard?.actionMode === "read-only" && readOnlyCard.actions.length === 1 && readOnlyCard.actions[0] === "Details" && readOnlyCard.details.length > 0;
    results.push({ state: "TASK_PICK_READ_ONLY", viewport: viewport.id, pass: Boolean(readOnlyPass), inspection: readonly, errors: structuredClone(readonlySession.errors) });
    await readonlySession.context.close();
  }

  const liveSession = await newPage(browser, { width: 390, height: 844 }, "OWNER");
  await open(liveSession.page, "/work/pick?source=ORDER");
  const live = await liveEvidence(liveSession.page);
  results.push({ state: "GROUPED_LIVE_UPDATE", viewport: "390x844", pass: live.pass && healthy(liveSession.errors), live, errors: structuredClone(liveSession.errors) });
  await liveSession.context.close();

  for (const reflow of reflows) {
    const session = await newPage(browser, { width: reflow.width, height: reflow.height }, "PICKER");
    const inspection = await open(session.page, "/work/consignments/pick");
    const pass = basePass(inspection, session.errors)
      && inspection.cards.every((card) => card.media && card.media.width <= 112.5 && card.media.height <= 112.5 && card.details.length > 0);
    results.push({ state: "WORK_CARD_200_PERCENT_REFLOW", viewport: reflow.id, pass, inspection, errors: structuredClone(session.errors) });
    await session.context.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.pass || !healthy(result.errors));
const report = { schema: "Phase7_4C1WorkCardBrowserV1", browser: executablePath, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ records: results.length, failures: failures.length, failed: failures.map((item) => `${item.state}:${item.viewport}`) }, null, 2));
if (failures.length) process.exitCode = 1;
