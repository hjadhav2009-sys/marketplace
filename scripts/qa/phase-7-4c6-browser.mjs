import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "phase-7-4c6");
const ownerReview = path.join(output, "owner-review");
const stagingRoot = path.join(root, ".codex-tmp", "stage3-sanitized-staging");
const credentials = JSON.parse(await readFile(path.join(stagingRoot, "credentials", "synthetic-users.json"), "utf8"));
const environment = JSON.parse(await readFile(path.join(stagingRoot, "runtime", "environment.json"), "utf8"));
const buildId = (await readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
if (!executablePath) throw new Error("Installed Google Chrome or Edge is required.");
if (environment.environment !== "PRIVATE_SYNTHETIC_STAGING" || !String(environment.databasePath).includes("stage3-sanitized-staging")) throw new Error("C6 browser QA requires private synthetic staging.");
await mkdir(ownerReview, { recursive: true });

function credential(scenario) { const found = credentials.users.find((item) => item.scenario === scenario); if (!found) throw new Error(`Missing synthetic ${scenario} credential.`); return found; }
function monitor(page) { const errors = { console: [], page: [], requests: [], responses: [] }; page.on("console", (message) => { if (message.type() === "error") errors.console.push(message.text()); }); page.on("pageerror", (error) => errors.page.push(error.message)); page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push({ url: request.url(), error: request.failure()?.errorText }); }); page.on("response", (response) => { if (response.status() >= 400) errors.responses.push({ url: response.url(), status: response.status() }); }); return errors; }
function noErrors(errors) { return Object.values(errors).every((items) => items.length === 0); }

async function session(browser, viewport, scenario) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.route(/https:\/\/(invalid\.example\.invalid|example\.invalid)\//, (route) => route.fulfill({ status: 200, contentType: "image/png", body: "synthetic-image" }));
  const page = await context.newPage(), errors = monitor(page), user = credential(scenario);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(user.username); await page.locator('input[name="password"]').fill(user.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }), page.locator("form").first().evaluate((form) => form.requestSubmit())]);
  if (new URL(page.url()).pathname === "/accounts") { await page.locator('input[name="accountId"][value="stage3-account-fk-01"]').check(); await Promise.all([page.waitForURL((url) => url.pathname !== "/accounts", { timeout: 20_000 }), page.getByRole("button", { name: "Select account" }).click()]); }
  return { context, page, errors };
}

async function inspect(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && !("disabled" in element && element.disabled); };
    const controls = [...document.querySelectorAll("#app-shell-main button,#app-shell-main a,#app-shell-main input:not([type=hidden]),#app-shell-main textarea,#app-shell-main select")].filter(visible);
    return { clientWidth: document.documentElement.clientWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), currentPages: document.querySelectorAll('[aria-current="page"]').length, undersized: controls.map((element) => { const rect = element.getBoundingClientRect(); return { text: (element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 60), width: rect.width, height: rect.height }; }).filter((item) => item.width < 44 || item.height < 44), text: document.body.innerText };
  });
}
const healthy = (result, errors) => result.clientWidth === result.scrollWidth && result.currentPages <= 1 && result.undersized.length === 0 && noErrors(errors);

async function scan(page, code, intent = "ANY", source = "ALL") {
  await page.goto(`${base}/work/scan`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-universal-scan-input]").fill(code); await page.locator('select[name="intent"]').selectOption(intent); await page.locator('select[name="source"]').selectOption(source);
  await Promise.all([page.waitForURL((url) => url.searchParams.get("q") === code, { timeout: 20_000 }), page.getByRole("button", { name: "Find work" }).click()]);
}

const viewports = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
const results = [], key = (viewport) => `${viewport.width}x${viewport.height}`;
const browser = await chromium.launch({ executablePath, headless: true, args: ["--disable-extensions", "--disable-sync"] });
try {
  for (const viewport of viewports) {
    const packer = await session(browser, viewport, "PACKER");
    await scan(packer.page, "PACKAGE-C5-MIXED-ROUTES-LONG-REFERENCE-0000000000000001", "PACK", "CUSTOMER_ORDERS");
    const scanner = await inspect(packer.page), scannerText = scanner.text.toLowerCase();
    results.push({ state: "SCANNER_PACKAGE_READY", viewport: key(viewport), pass: scannerText.includes("universal scan") && scannerText.includes("pack ready") && scannerText.includes("pack completed") && scannerText.includes("package-c5-mixed-routes") && healthy(scanner, packer.errors), inspection: scanner, errors: structuredClone(packer.errors) });
    if (viewport.width === 390 || viewport.width === 1440) await packer.page.screenshot({ path: path.join(ownerReview, `${viewport.width}-scanner.png`), fullPage: true });
    await packer.context.close();

    const owner = await session(browser, viewport, "OWNER");
    await owner.page.goto(`${base}/work/problems?source=ORDER`, { waitUntil: "domcontentloaded" });
    const order = await inspect(owner.page), orderText = order.text.toLowerCase();
    results.push({ state: "ORDER_PROBLEMS", viewport: key(viewport), pass: orderText.includes("customer orders") && orderText.includes("work paused") && orderText.includes("synthetic damaged item") && orderText.includes("resolve") && healthy(order, owner.errors), inspection: order, errors: structuredClone(owner.errors) });
    if (viewport.width === 390 || viewport.width === 1440) await owner.page.screenshot({ path: path.join(ownerReview, `${viewport.width}-order-problems.png`), fullPage: true });
    await owner.page.goto(`${base}/work/problems?source=CONSIGNMENT`, { waitUntil: "domcontentloaded" });
    const consignment = await inspect(owner.page), consignmentText = consignment.text.toLowerCase();
    results.push({ state: "CONSIGNMENT_PROBLEMS", viewport: key(viewport), pass: consignmentText.includes("consignments") && consignmentText.includes("work paused") && consignmentText.includes("reassign") && healthy(consignment, owner.errors), inspection: consignment, errors: structuredClone(owner.errors) });
    if (viewport.width === 390 || viewport.width === 1440) await owner.page.screenshot({ path: path.join(ownerReview, `${viewport.width}-consignment-problems.png`), fullPage: true });
    await owner.context.close();
  }

  const marker = await session(browser, { width: 390, height: 844 }, "MARKER");
  await scan(marker.page, "stage4-c3a-multi-choice-mark", "MARK", "CONSIGNMENTS");
  const mark = await inspect(marker.page), markText = mark.text.toLowerCase();
  const markButton = marker.page.getByRole("button", { name: "Marking Completed" }).first(); await markButton.click();
  const routeDialog = marker.page.locator('[data-worker-overlay="PROCESS_FLOW"] [role="dialog"]'); await routeDialog.waitFor();
  const routeText = (await routeDialog.innerText()).toLowerCase();
  await marker.page.screenshot({ path: path.join(ownerReview, "390-scanner-unresolved-mark.png"), fullPage: true });
  await marker.page.keyboard.press("Escape"); const focusReturned = await markButton.evaluate((element) => document.activeElement === element);
  results.push({ state: "SCANNER_UNRESOLVED_MARK", viewport: "390x844", pass: markText.includes("marking completed") && !markText.includes("complete stage") && routeText.includes("send to assembly") && routeText.includes("send to pack") && focusReturned && healthy(mark, marker.errors), inspection: mark, errors: marker.errors });
  await marker.context.close();

  const completedSession = await session(browser, { width: 390, height: 844 }, "PACKER");
  await scan(completedSession.page, "STAGE-AWB-11", "PACK", "CUSTOMER_ORDERS");
  const completed = await inspect(completedSession.page), completedText = completed.text.toLowerCase();
  results.push({ state: "SCANNER_COMPLETED", viewport: "390x844", pass: completedText.includes("packed") && completedText.includes("scan next") && !completedText.includes("pack completed") && healthy(completed, completedSession.errors), inspection: completed, errors: completedSession.errors });
  await completedSession.page.screenshot({ path: path.join(ownerReview, "390-scanner-completed.png"), fullPage: true });
  await scan(completedSession.page, "STAGE-FK-SKU-001", "ANY", "ALL");
  const multiple = await inspect(completedSession.page); results.push({ state: "SCANNER_MULTIPLE_MATCHES", viewport: "390x844", pass: await completedSession.page.locator("[data-scanner-candidate]").count() > 1 && healthy(multiple, completedSession.errors), inspection: multiple, errors: completedSession.errors });
  await completedSession.page.screenshot({ path: path.join(ownerReview, "390-scanner-multiple-matches.png"), fullPage: true }); await completedSession.context.close();

  const desktopScanner = await session(browser, { width: 1440, height: 900 }, "PACKER");
  await scan(desktopScanner.page, "STAGE-FK-SKU-001", "ANY", "ALL");
  const desktopMultiple = await inspect(desktopScanner.page);
  results.push({ state: "SCANNER_MULTIPLE_MATCHES", viewport: "1440x900", pass: await desktopScanner.page.locator("[data-scanner-candidate]").count() > 1 && healthy(desktopMultiple, desktopScanner.errors), inspection: desktopMultiple, errors: desktopScanner.errors });
  await desktopScanner.page.screenshot({ path: path.join(ownerReview, "1440-scanner-multiple-matches.png"), fullPage: true });
  await desktopScanner.context.close();

  const ownerDialog = await session(browser, { width: 390, height: 844 }, "OWNER");
  await ownerDialog.page.goto(`${base}/work/problems?source=ORDER`, { waitUntil: "domcontentloaded" });
  await ownerDialog.page.getByRole("button", { name: "Resolve" }).first().click();
  const resolveDialog = ownerDialog.page.locator('[data-worker-overlay="PROBLEM"] [role="dialog"]'); await resolveDialog.waitFor();
  const bounds = await resolveDialog.boundingBox(); await ownerDialog.page.screenshot({ path: path.join(ownerReview, "390-order-problem-resolve-sheet.png"), fullPage: true });
  await ownerDialog.page.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); const reflow = await inspect(ownerDialog.page);
  results.push({ state: "PROBLEM_RESOLVE_AND_REFLOW", viewport: "390x844", pass: Boolean(bounds && bounds.height <= 844) && reflow.clientWidth === reflow.scrollWidth && reflow.undersized.length === 0 && noErrors(ownerDialog.errors), inspection: reflow, errors: ownerDialog.errors });
  await ownerDialog.context.close();

  const desktopDialog = await session(browser, { width: 1440, height: 900 }, "OWNER");
  await desktopDialog.page.goto(`${base}/work/problems?source=ORDER`, { waitUntil: "domcontentloaded" });
  await desktopDialog.page.getByRole("button", { name: "Resolve" }).first().click();
  await desktopDialog.page.locator('[data-worker-overlay="PROBLEM"] [role="dialog"]').waitFor();
  await desktopDialog.page.screenshot({ path: path.join(ownerReview, "1440-order-problem-resolve-dialog.png"), fullPage: true });
  const desktopResolve = await inspect(desktopDialog.page);
  results.push({ state: "PROBLEM_RESOLVE_DIALOG", viewport: "1440x900", pass: healthy(desktopResolve, desktopDialog.errors), inspection: desktopResolve, errors: desktopDialog.errors });
  await desktopDialog.context.close();

  const zoomSession = await session(browser, { width: 390, height: 844 }, "OWNER");
  const zoomStates = [
    { name: "SCANNER_PACKAGE", url: "/work/scan?q=PACKAGE-C5-MIXED-ROUTES-LONG-REFERENCE-0000000000000001&intent=PACK&source=CUSTOMER_ORDERS" },
    { name: "SCANNER_MULTIPLE", url: "/work/scan?q=STAGE-FK-SKU-001&intent=ANY&source=ALL" },
    { name: "ORDER_PROBLEM", url: "/work/problems?source=ORDER" },
    { name: "CONSIGNMENT_PROBLEM", url: "/work/problems?source=CONSIGNMENT" },
  ];
  for (const state of zoomStates) {
    await zoomSession.page.goto(`${base}${state.url}`, { waitUntil: "domcontentloaded" });
    await zoomSession.page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const inspected = await inspect(zoomSession.page);
    results.push({ state: `REFLOW_200_${state.name}`, viewport: "390x844", pass: inspected.clientWidth === inspected.scrollWidth && inspected.undersized.length === 0 && noErrors(zoomSession.errors), inspection: inspected, errors: structuredClone(zoomSession.errors) });
  }
  await zoomSession.context.close();
} finally { await browser.close(); }

const failures = results.filter((item) => !item.pass);
const report = { schema: "Phase7_4C6ScannerProblemsBrowserV1", browser: executablePath, database: "PRIVATE_SYNTHETIC_STAGING", sourceSha: environment.sourceSha, buildId, records: results.length, failures: failures.length, results };
await writeFile(path.join(output, "browser-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ records: results.length, failures: failures.length, sourceSha: environment.sourceSha, buildId }, null, 2));
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
