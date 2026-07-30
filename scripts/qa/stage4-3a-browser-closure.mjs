import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";

const root = path.resolve(process.cwd());
const base = "http://127.0.0.1:3188";
const output = path.join(root, ".codex-tmp", "stage4-3a", "browser");
const credentialsPath = path.join(root, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined;
const args = new Set(process.argv.slice(2));
const headed = args.has("--headed");
const capture = !args.has("--verify");
function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const requestedRole = optionValue("--role");
const requestedViewport = optionValue("--viewport");

if (!executablePath) throw new Error("Chrome, Edge, or an already installed Playwright browser is required.");

const viewports = [
  { id: "360x800", width: 360, height: 800 },
  { id: "390x844", width: 390, height: 844 },
  { id: "430x932", width: 430, height: 932 },
  { id: "768x1024", width: 768, height: 1024 },
  { id: "1024x768", width: 1024, height: 768 },
  { id: "1440x900", width: 1440, height: 900 },
].filter((item) => !requestedViewport || item.id === requestedViewport);

const roles = [
  { id: "OWNER", display: "Synthetic Owner", expected: ["Dashboard", "Work Hub", "Product Inventory", "Users"] },
  { id: "PICKER", display: "Synthetic Picker A", expected: ["Work", "Scan / Pack", "Order Pick", "Consignment Pick", "Work Problems"] },
  { id: "MARKER", display: "Synthetic Marker", expected: ["Work", "Scan / Pack", "Marking", "Work Problems"] },
  { id: "ASSEMBLER", display: "Synthetic Assembler", expected: ["Work", "Scan / Pack", "Assembly", "Work Problems"] },
  { id: "PACKER", display: "Synthetic Packer A", expected: ["Work", "Scan / Pack", "Order Pack", "Consignment Pack", "Work Problems"] },
  { id: "VIEW_ONLY", display: "Synthetic View-All Worker", expected: ["Work", "Scan / Pack", "Assembly", "Work Problems", "Consignments"] },
  { id: "MIXED_PERMISSIONS", display: "Synthetic Import Manager", expected: ["Work Problems", "Consignments"] },
].filter((item) => !requestedRole || item.id === requestedRole);

const credentialFile = JSON.parse(await readFile(credentialsPath, "utf8"));
const credentialByDisplay = new Map(credentialFile.users.map((entry) => [entry.displayRole, entry]));
await mkdir(output, { recursive: true });

async function login(page, role) {
  const credential = credentialByDisplay.get(role.display);
  if (!credential) throw new Error(`Missing synthetic credential for ${role.id}`);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(credential.username);
  await page.locator('input[name="password"]').fill(credential.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit()),
  ]);
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    for (let y = 0; y < height; y += Math.max(300, Math.floor(innerHeight * .7))) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    scrollTo(0, 0);
    for (const animation of document.getAnimations()) animation.pause();
  });
}

async function evidence(file) {
  const bytes = await readFile(file);
  const metadata = await sharp(bytes, { limitInputPixels: false }).metadata();
  return { width: metadata.width, height: metadata.height, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function captureFull(page, name) {
  await settle(page);
  const file = path.join(output, `${name}.png`);
  if (capture) await page.screenshot({ path: file, type: "png", fullPage: true, animations: "disabled", caret: "hide", scale: "device" });
  return capture ? { file: path.relative(root, file), ...await evidence(file) } : null;
}

function monitor(page) {
  const errors = { console: [], page: [], requests: [], responses: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => errors.page.push(error.message));
  page.on("requestfailed", (request) => { if (request.failure()?.errorText !== "net::ERR_ABORTED") errors.requests.push(request.url()); });
  page.on("response", (response) => { if (response.status() >= 500) errors.responses.push({ url: response.url(), status: response.status() }); });
  return errors;
}

function snapshotErrors(errors) {
  return {
    console: [...errors.console],
    page: [...errors.page],
    requests: [...errors.requests],
    responses: [...errors.responses],
  };
}

async function inspect(page) {
  return page.evaluate(() => ({
    url: location.pathname + location.search,
    heading: document.querySelector("h1")?.textContent?.trim() ?? "",
    text: document.body.innerText,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    bottomNav: Boolean(document.querySelector("[data-mobile-bottom-nav]")),
    staging: document.body.innerText.includes("PRIVATE SYNTHETIC STAGING"),
    visibleLinks: [...document.querySelectorAll("a")].filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map((item) => item.textContent?.trim()).filter(Boolean),
  }));
}

const browser = await chromium.launch({ executablePath, headless: !headed, args: ["--disable-extensions", "--disable-sync"] });
const results = [];
try {
  for (const viewport of viewports) {
    for (const state of [
      ["AUTH_DEFAULT", "/login"],
      ["AUTH_EXPIRED", "/login?expired=1"],
      ["AUTH_SESSION_ERROR", "/login?error=session"],
      ["AUTH_SETUP_COMPLETE", "/login?setup=1"],
      ["AUTH_PASSWORD_CHANGED", "/login?passwordChanged=1"],
    ]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const page = await context.newPage();
      const errors = monitor(page);
      await page.goto(`${base}${state[1]}`, { waitUntil: "domcontentloaded" });
      if (state[0] === "AUTH_DEFAULT") {
        await page.locator('input[name="username"]').focus();
        await page.getByRole("button", { name: "Show password" }).click();
        if ((await page.locator('input[name="password"]').getAttribute("type")) !== "text") throw new Error("Password visibility did not toggle.");
        await page.getByRole("button", { name: "Hide password" }).click();
      }
      const stateInspection = await inspect(page);
      results.push({ id: state[0], viewport: viewport.id, pass: stateInspection.staging && !stateInspection.overflow && !errors.console.length && !errors.page.length, inspection: stateInspection, errors: snapshotErrors(errors), capture: await captureFull(page, `${state[0]}__${viewport.id}__FULL-PAGE@2x`) });
      await context.close();
    }

    const invalidContext = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const invalidPage = await invalidContext.newPage();
    const invalidErrors = monitor(invalidPage);
    await invalidPage.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await invalidPage.locator('input[name="username"]').fill("invalid-synthetic-user");
    await invalidPage.locator('input[name="password"]').fill("invalid-synthetic-password");
    await invalidPage.locator("form").evaluate((form) => form.requestSubmit());
    await invalidPage.waitForURL(/error=invalid/);
    await invalidPage.waitForTimeout(350);
    await invalidPage.evaluate(() => document.fonts.ready);
    const invalidInspection = await inspect(invalidPage);
    results.push({ id: "AUTH_INVALID", viewport: viewport.id, pass: /incorrect/.test(invalidInspection.text) && !invalidInspection.overflow && !invalidErrors.page.length, inspection: invalidInspection, errors: snapshotErrors(invalidErrors), capture: await captureFull(invalidPage, `AUTH_INVALID__${viewport.id}__FULL-PAGE@2x`) });
    await invalidContext.close();

    const forgotContext = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const forgotPage = await forgotContext.newPage();
    const forgotErrors = monitor(forgotPage);
    await forgotPage.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await forgotPage.getByRole("link", { name: "Forgot password?" }).click();
    await forgotPage.waitForURL(/forgot-password/);
    const forgotInspection = await inspect(forgotPage);
    results.push({ id: "AUTH_FORGOT_PASSWORD_LINK", viewport: viewport.id, pass: forgotInspection.url.startsWith("/forgot-password") && !forgotInspection.overflow && !forgotErrors.page.length, inspection: forgotInspection, errors: snapshotErrors(forgotErrors), capture: await captureFull(forgotPage, `AUTH_FORGOT_PASSWORD_LINK__${viewport.id}__FULL-PAGE@2x`) });
    await forgotContext.close();

    for (const role of roles) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const page = await context.newPage();
      const errors = monitor(page);
      await login(page, role);
      await page.goto(`${base}/work`, { waitUntil: "domcontentloaded" });
      if (viewport.width < 1024) {
        await page.getByRole("button", { name: "Open navigation" }).click();
        for (const expected of role.expected) {
          if (!(await page.getByRole("link", { name: expected, exact: true }).count())) throw new Error(`${role.id} missing ${expected}`);
        }
        if (role.id !== "OWNER" && await page.getByRole("link", { name: "Users", exact: true }).count()) throw new Error(`${role.id} leaked Users link`);
        await page.keyboard.press("Escape");
      }
      if (viewport.width < 640) {
        const trigger = page.getByRole("button", { name: "Open account menu" });
        await trigger.click();
        if (!(await page.getByRole("menuitem", { name: "Switch account" }).count())) throw new Error("Switch account missing.");
        if (!(await page.getByRole("menuitem", { name: "Logout" }).count())) throw new Error("Server Logout control missing.");
        await page.keyboard.press("Escape");
        if (await page.getByRole("menuitem", { name: "Logout" }).count()) throw new Error("Escape did not close account menu.");
      }
      const roleInspection = await inspect(page);
      results.push({ id: `ROLE_${role.id}`, viewport: viewport.id, pass: roleInspection.staging && !roleInspection.overflow && !roleInspection.bottomNav && !errors.console.length && !errors.page.length, inspection: roleInspection, errors: snapshotErrors(errors), capture: await captureFull(page, `ROLE_${role.id}__${viewport.id}__FULL-PAGE@2x`) });

      if (role.id === "PICKER") {
        await page.goto(`${base}/owner/users`, { waitUntil: "domcontentloaded" });
        await page.waitForURL(/access-denied/);
        const denied = await inspect(page);
        const protectedVisible = denied.text.includes("Create User") || denied.text.includes("Worker permissions");
        results.push({ id: "AUTH_FORBIDDEN_REAL", viewport: viewport.id, pass: denied.heading.includes("You do not have permission") && !protectedVisible && !denied.overflow, inspection: denied, errors: snapshotErrors(errors), capture: await captureFull(page, `AUTH_FORBIDDEN_REAL__${viewport.id}__FULL-PAGE@2x`) });

        await page.goto(`${base}/work/pick?source=ORDER`, { waitUntil: "domcontentloaded" });
        const pick = await inspect(page);
        for (const label of ["Picked All", "Partial Quantity", "Problem", "Details"]) {
          if (!(await page.getByText(label, { exact: true }).count())) throw new Error(`Pick action ${label} missing`);
        }
        for (const label of ["Partial Quantity", "Problem", "Details"]) {
          const href = await page.getByRole("link", { name: label, exact: true }).first().getAttribute("href");
          if (!href) throw new Error(`${label} destination missing`);
          const response = await context.request.get(`${base}${href.split("#")[0]}`);
          if (response.status() >= 400) throw new Error(`${label} destination returned ${response.status()}`);
        }
        const routeTrigger = page.getByRole("button", { name: "Picked All" }).first();
        await routeTrigger.click();
        const dialogText = await page.locator("body").innerText();
        const routeContractVisible = /route|Direct|Mark|Assembly/i.test(dialogText);
        results.push({ id: "PICK_ACTIONS", viewport: viewport.id, pass: routeContractVisible && !pick.overflow, inspection: pick, errors: snapshotErrors(errors), capture: await captureFull(page, `PICK_ACTIONS__${viewport.id}__FULL-PAGE@2x`) });
        if (viewport.id === "1440x900") {
          const cardCountBefore = await page.locator("[data-responsive-work-card]").count();
          await page.getByRole("button", { name: "Direct to Pack", exact: true }).click();
          await Promise.all([
            page.waitForTimeout(500),
            page.getByRole("button", { name: "Continue", exact: true }).click(),
          ]);
          await page.waitForTimeout(600);
          const cardCountAfter = await page.locator("[data-responsive-work-card]").count();
          const mutationInspection = await inspect(page);
          const successRedirect = new URL(page.url()).searchParams.get("success")?.includes("completed and routed") ?? false;
          const controlledStale = new URL(page.url()).searchParams.get("error")?.includes("work changed") ?? false;
          const dialogClosed = await page.locator("[data-work-reason-dialog]").count() === 0;
          results.push({ id: "PICK_MUTATION_AND_LIVE_REFRESH", viewport: viewport.id, pass: dialogClosed && cardCountAfter <= cardCountBefore && (successRedirect || controlledStale), outcome: successRedirect ? "MUTATED_ONCE" : "CONTROLLED_STALE_REPLAY_AFTER_PRIOR_SUCCESS", inspection: mutationInspection, errors: snapshotErrors(errors), capture: await captureFull(page, `PICK_MUTATION_AND_LIVE_REFRESH__${viewport.id}__FULL-PAGE@2x`) });
        }
      }
      if (viewport.id === "390x844") {
        await page.goto(`${base}/work`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Open account menu" }).click();
        await page.getByRole("menuitem", { name: "Switch account" }).click();
        await page.waitForURL(/\/accounts/);
        const switchInspection = await inspect(page);
        results.push({ id: `ACCOUNT_SWITCH_${role.id}`, viewport: viewport.id, pass: switchInspection.url.startsWith("/accounts"), inspection: switchInspection, errors: snapshotErrors(errors), capture: await captureFull(page, `ACCOUNT_SWITCH_${role.id}__${viewport.id}__FULL-PAGE@2x`) });
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Open account menu" }).click();
        await page.getByRole("menuitem", { name: "Logout" }).click();
        await page.waitForURL(/\/login/);
        const logoutInspection = await inspect(page);
        results.push({ id: `LOGOUT_${role.id}`, viewport: viewport.id, pass: logoutInspection.url.startsWith("/login"), inspection: logoutInspection, errors: { console: [], page: [], requests: [], responses: [] }, capture: await captureFull(page, `LOGOUT_${role.id}__${viewport.id}__FULL-PAGE@2x`) });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failures = results.filter((item) => !item.pass || item.errors.console.length || item.errors.page.length || item.errors.requests.length || item.errors.responses.length);
const report = {
  schema: "Stage4_3ABrowserClosureV1",
  syntheticOnly: true,
  executablePath,
  headed,
  viewports: viewports.map((item) => item.id),
  roles: roles.map((item) => item.id),
  resultCount: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => ({ id: item.id, viewport: item.viewport, errors: item.errors, url: item.inspection.url })),
  results,
};
await writeFile(path.join(output, "browser-closure-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ resultCount: report.resultCount, passed: report.passed, failed: report.failed, executablePath }, null, 2));
if (failures.length) process.exitCode = 1;
