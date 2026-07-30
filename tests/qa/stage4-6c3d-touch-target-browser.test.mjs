import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import {
  HOST,
  PORT,
  ROOT,
  buildEnvironment,
  loadPrivateConfig,
  portOwner,
  sha256,
} from "../../scripts/staging/core.mjs";

const require = createRequire(import.meta.url);
const BASE = `http://${HOST}:${PORT}`;
const OUTPUT_ROOT = path.join(ROOT, ".codex-tmp", "stage4-6c3d");
const CREDENTIAL_PATH = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(CHROME) ? CHROME : existsSync(EDGE) ? EDGE : undefined;
const mode = process.argv.includes("--before") ? "before" : "after";
const runtimeSha = String(process.env.STAGE4_6C3D_RUNTIME_SHA ?? "").trim();
const buildId = String(process.env.STAGE4_6C3D_BUILD_ID ?? "").trim();
const requestedViewports = String(process.env.STAGE4_6C3D_VIEWPORTS ?? (mode === "before" ? "360x800" : "360x800,390x844,768x1024,1440x900"));
const allViewports = new Map([
  ["360x800", { width: 360, height: 800 }],
  ["390x844", { width: 390, height: 844 }],
  ["768x1024", { width: 768, height: 1024 }],
  ["1440x900", { width: 1440, height: 900 }],
]);
const viewports = requestedViewports.split(",").map((id) => ({ id: id.trim(), ...allViewports.get(id.trim()) }));

assert.ok(runtimeSha, "STAGE4_6C3D_RUNTIME_SHA is required.");
assert.ok(buildId, "STAGE4_6C3D_BUILD_ID is required.");
assert.ok(executablePath, "Installed Chrome or Edge is required.");
assert.ok(viewports.every((item) => item.width && item.height), "Every requested viewport must be supported.");
assert.equal(Boolean(await portOwner()), false, `Port ${PORT} must be closed before the bounded browser test.`);
assert.equal(String(await readFile(path.join(ROOT, ".next", "BUILD_ID"), "utf8")).trim(), buildId, "The expected BUILD_ID must match the existing build.");

const credentials = JSON.parse(await readFile(CREDENTIAL_PATH, "utf8"));
const credentialByRole = new Map(credentials.users.map((item) => [item.displayRole, item]));
const owner = credentialByRole.get("Synthetic Owner");
const packer = credentialByRole.get("Synthetic Packer A");
assert.ok(owner?.username && owner?.password, "Synthetic Owner credentials are required.");
assert.ok(packer?.username && packer?.password, "Synthetic Packer credentials are required.");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
    let json = null;
    try { json = await response.json(); } catch {}
    return { status: response.status, json };
  } catch {
    return { status: null, json: null };
  }
}

async function waitForServer(child, expected) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Bounded staging server exited with code ${child.exitCode}.`);
    const [login, identity] = await Promise.all([
      fetchStatus(`${BASE}/login`),
      fetchStatus(`${BASE}/api/staging/identity`),
    ]);
    if (login.status === 200
      && identity.status === 200
      && identity.json?.sourceSha === expected.sourceSha
      && identity.json?.buildId === expected.buildId
      && identity.json?.pid === child.pid
      && identity.json?.commandFingerprint === expected.commandFingerprint
      && identity.json?.tokenSha256 === expected.tokenSha256) return identity.json;
    await delay(500);
  }
  throw new Error("Bounded staging server failed exact health verification.");
}

async function stopOwnedServer(child) {
  if (!child || child.exitCode != null) return;
  try { child.kill("SIGTERM"); } catch {}
  let deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (!await portOwner()) return;
    await delay(250);
  }
  if (process.platform === "win32" && await portOwner()) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
    });
  }
  deadline = Date.now() + 15_000;
  while (Date.now() < deadline && await portOwner()) await delay(250);
  assert.equal(Boolean(await portOwner()), false, "The bounded staging server must release port 3188.");
}

async function login(page, credential) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.locator('input[name="username"]').fill(credential.username);
  await page.locator('input[name="password"]').fill(credential.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 }),
    page.locator("form").first().evaluate((form) => form.requestSubmit()),
  ]);
}

function monitor(page) {
  const result = { consoleErrors: [], pageErrors: [], failedRequests: [], errorResponses: [] };
  page.on("console", (message) => {
    if (message.type() === "error") result.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") result.failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() >= 500) result.errorResponses.push({ url: response.url(), status: response.status() });
  });
  return result;
}

async function settle(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(200);
}

async function measure(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.focus();
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const before = getComputedStyle(element, "::before");
    const after = getComputedStyle(element, "::after");
    const pseudoExpands = [before, after].some((pseudo) => {
      const content = pseudo.content;
      return content && content !== "none" && content !== "normal" && pseudo.pointerEvents !== "none";
    });
    return {
      selectorTag: element.tagName,
      accessibleName: (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " "),
      enabled: !("disabled" in element && element.disabled) && element.getAttribute("aria-disabled") !== "true",
      visibleBox: { width: Math.round(rect.width), height: Math.round(rect.height) },
      clickableBox: { width: Math.round(rect.width), height: Math.round(rect.height) },
      minHeight: style.minHeight,
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      lineHeight: style.lineHeight,
      tabIndex: element.tabIndex,
      keyboardFocusable: element.tabIndex >= 0,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      beforeContent: before.content,
      afterContent: after.content,
      expandedHitArea: pseudoExpands,
    };
  });
}

function assertCleanBrowser(result, label) {
  assert.deepEqual(result.consoleErrors, [], `${label} must have no console errors.`);
  assert.deepEqual(result.pageErrors, [], `${label} must have no page errors.`);
  assert.deepEqual(result.failedRequests, [], `${label} must have no unexpected failed requests.`);
  assert.deepEqual(result.errorResponses, [], `${label} must have no 5xx responses.`);
}

async function inspectOverflow(page) {
  return page.evaluate(() => ({
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth + 2,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    clientWidth: document.documentElement.clientWidth,
  }));
}

await mkdir(OUTPUT_ROOT, { recursive: true });
const config = await loadPrivateConfig();
const nextBin = require.resolve("next/dist/bin/next");
const commandFingerprint = sha256([nextBin, "start", HOST, String(PORT)].join("\0"));
const expected = {
  sourceSha: runtimeSha,
  buildId,
  commandFingerprint,
  tokenSha256: sha256(config.runtimeIdentityToken),
};
const environment = buildEnvironment(config, expected);
environment.ATLAS_RUNTIME_SHA = runtimeSha;
environment.ATLAS_RUNTIME_BUILD_ID = buildId;
const child = spawn(process.execPath, [nextBin, "start", "-H", HOST, "-p", String(PORT)], {
  cwd: ROOT,
  env: environment,
  detached: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (chunk) => { serverLog += String(chunk); });
child.stderr.on("data", (chunk) => { serverLog += String(chunk); });

let browser;
const evidence = {
  schema: "Stage4_6C3DTouchTargetBrowserEvidenceV1",
  mode,
  runtimeSha,
  buildId,
  viewports: [],
  startedAt: new Date().toISOString(),
};

try {
  evidence.identity = await waitForServer(child, expected);
  browser = await chromium.launch({ executablePath, headless: true });
  for (const viewport of viewports) {
    const viewportEvidence = { viewport: viewport.id };

    const ownerContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const ownerPage = await ownerContext.newPage();
    const ownerErrors = monitor(ownerPage);
    await login(ownerPage, owner);
    await ownerPage.goto(`${BASE}/owner/imports/stage4-import-mapping`, { waitUntil: "domcontentloaded" });
    await settle(ownerPage);
    assert.match(await ownerPage.locator("body").innerText(), /NEEDS MAPPING/i);
    const mappingLink = ownerPage.getByRole("link", { name: "Map File Headers", exact: true });
    await mappingLink.waitFor({ state: "visible" });
    viewportEvidence.mapFileHeaders = await measure(mappingLink);
    assert.equal(await mappingLink.getAttribute("href"), "/owner/imports/stage4-import-mapping/mapping");
    viewportEvidence.importOverflow = await inspectOverflow(ownerPage);
    assert.equal(viewportEvidence.importOverflow.overflow, false, "Import mapping page must not overflow horizontally.");
    assertCleanBrowser(ownerErrors, `${viewport.id} import mapping`);
    viewportEvidence.importBrowser = ownerErrors;
    await ownerContext.close();

    const packerContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const packerPage = await packerContext.newPage();
    const packerErrors = monitor(packerPage);
    await login(packerPage, packer);
    await packerPage.goto(`${BASE}/packing/STAGE-AWB-ASSEMBLY-LOCKED`, { waitUntil: "domcontentloaded" });
    await settle(packerPage);
    const bodyText = await packerPage.locator("body").innerText();
    assert.match(bodyText, /Assembly is required before packing/i);
    assert.equal(await packerPage.getByRole("button", { name: /^Confirm packed$/i }).count(), 0, "Confirm packed must remain absent.");
    const scanLink = packerPage.getByRole("link", { name: "Scan next", exact: true }).first();
    const summary = await packerPage.locator("summary").filter({ hasText: /^Mark problem$/ }).first();
    await scanLink.waitFor({ state: "visible" });
    await summary.waitFor({ state: "visible" });
    viewportEvidence.scanNext = await measure(scanLink);
    viewportEvidence.markProblem = await measure(summary);
    assert.equal(await scanLink.getAttribute("href"), "/packing");
    assert.equal(await summary.evaluate((element) => element.parentElement?.open), false);
    await summary.click();
    assert.equal(await summary.evaluate((element) => element.parentElement?.open), true, "Mouse click must open Mark problem.");
    await summary.click();
    assert.equal(await summary.evaluate((element) => element.parentElement?.open), false, "Mouse click must close Mark problem.");
    await summary.focus();
    await packerPage.keyboard.press("Enter");
    assert.equal(await summary.evaluate((element) => element.parentElement?.open), true, "Enter must open Mark problem.");
    await packerPage.keyboard.press("Space");
    assert.equal(await summary.evaluate((element) => element.parentElement?.open), false, "Space must close Mark problem.");
    await summary.focus();
    viewportEvidence.markProblemFocused = await measure(summary);
    const saveProblem = packerPage.getByRole("button", { name: "Save problem", exact: true });
    await summary.click();
    await saveProblem.waitFor({ state: "visible" });
    viewportEvidence.saveProblem = await measure(saveProblem);
    viewportEvidence.packOverflow = await inspectOverflow(packerPage);
    assert.equal(viewportEvidence.packOverflow.overflow, false, "Assembly-locked Pack page must not overflow horizontally.");
    assertCleanBrowser(packerErrors, `${viewport.id} assembly-locked Pack`);
    viewportEvidence.packBrowser = packerErrors;
    await packerContext.close();

    if (mode === "after") {
      for (const [name, control] of Object.entries({
        mapFileHeaders: viewportEvidence.mapFileHeaders,
        scanNext: viewportEvidence.scanNext,
        markProblem: viewportEvidence.markProblem,
      })) {
        assert.equal(control.enabled, true, `${name} must remain enabled.`);
        assert.ok(control.clickableBox.width >= 44 && control.clickableBox.height >= 44, `${name} must be at least 44×44.`);
        assert.equal(control.keyboardFocusable, true, `${name} must remain keyboard focusable.`);
      }
      assert.ok(viewportEvidence.markProblemFocused.outlineStyle !== "none"
        && Number.parseFloat(viewportEvidence.markProblemFocused.outlineWidth) > 0, "Mark problem must retain a visible focus outline.");
      assert.ok(viewportEvidence.saveProblem.clickableBox.width >= 44
        && viewportEvidence.saveProblem.clickableBox.height >= 44, "Save problem must remain a separate usable control.");
    }

    evidence.viewports.push(viewportEvidence);
  }
  evidence.status = mode === "after" ? "PASSED" : "MEASURED";
} catch (error) {
  evidence.status = "FAILED";
  evidence.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  if (browser) await browser.close();
  await stopOwnedServer(child);
  evidence.portClosed = !await portOwner();
  evidence.finishedAt = new Date().toISOString();
  evidence.serverLogTail = serverLog.split(/\r?\n/).filter(Boolean).slice(-20);
  await writeFile(path.join(OUTPUT_ROOT, `${mode}-touch-targets.json`), `${JSON.stringify(evidence, null, 2)}\n`);
}

console.log(JSON.stringify({
  status: evidence.status,
  mode,
  runtimeSha,
  buildId,
  viewports: evidence.viewports.map((item) => ({
    viewport: item.viewport,
    mapFileHeaders: item.mapFileHeaders.clickableBox,
    scanNext: item.scanNext.clickableBox,
    markProblem: item.markProblem.clickableBox,
    overflow: item.importOverflow.overflow || item.packOverflow.overflow,
  })),
  portClosed: evidence.portClosed,
}, null, 2));
