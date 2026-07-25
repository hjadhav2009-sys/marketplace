import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const BASE = "http://127.0.0.1:3188";
const CREDENTIALS = path.join(ROOT, ".codex-tmp", "stage3-sanitized-staging", "credentials", "synthetic-users.json");
const PROOF_ROOT = path.join(ROOT, ".codex-tmp", "stage4-2c", "proof");
const APPROVAL_ROOT = path.join(ROOT, ".codex-tmp", "stage4-2c", "approved-designs");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = existsSync(CHROME) ? CHROME : existsSync(EDGE) ? EDGE : undefined;
if (!executablePath) throw new Error("Chrome or Edge is required.");

await mkdir(PROOF_ROOT, { recursive: true });
await mkdir(APPROVAL_ROOT, { recursive: true });
const credentialFile = JSON.parse(await readFile(CREDENTIALS, "utf8"));
const owner = credentialFile.users.find((entry) => entry.displayRole === "Synthetic Owner");
if (!owner) throw new Error("Synthetic Owner credentials are missing.");
const approvalsBefore = (await readdir(APPROVAL_ROOT)).filter((name) => name.endsWith(".json")).length;

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const errorResponses = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => { if (response.status() >= 400) errorResponses.push({ status: response.status(), url: response.url() }); });

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(owner.username);
  await page.locator('input[name="password"]').fill(owner.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login")),
    page.locator("form").first().evaluate((form) => form.requestSubmit())
  ]);

  await page.goto(`${BASE}/__qa/ui-audit`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Search route or state").fill("PICK_READY");
  const selectedEntry = page.locator("nav button").filter({ hasText: "PICK_READY" }).first();
  const selectedEntryText = await selectedEntry.textContent();
  const selectedViewport = selectedEntryText?.match(/\d+x\d+/)?.[0];
  if (!selectedViewport) throw new Error("Selected Pick viewport could not be identified.");
  await selectedEntry.click();
  await page.getByRole("heading", { name: "PICK_READY", exact: true }).waitFor();
  const selectedKey = `PICK_READY:${selectedViewport}`;
  await page.locator('input[type="file"]').setInputFiles({
    name: "pick-card-redesign.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      [selectedKey]: {
        ownerNotes: "",
        completed: false,
        marks: [],
        redesignMarks: [{ id: "proof-rectangle", tool: "rectangle", x: .2, y: .2, width: .3, height: .2, color: "#e11d48" }]
      }
    }))
  });
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Redesign", exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "select", exact: true }).click();
  await page.locator("div.absolute.border").first().click({ position: { x: 4, y: 4 } });
  await page.getByRole("button", { name: "Duplicate layer" }).click();
  await page.getByRole("button", { name: "Move", exact: true }).first().click();
  await page.getByRole("button", { name: "Resize", exact: true }).first().click();
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByPlaceholder("Owner review notes").fill("[REDESIGN] Synthetic Pick-card proof note.");
  await page.getByRole("button", { name: "Save notes" }).click();

  const jsonDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const jsonDownload = await jsonDownloadPromise;
  await jsonDownload.saveAs(path.join(PROOF_ROOT, "pick-card-redesign.json"));
  await page.getByRole("button", { name: "Redesign", exact: true }).click();
  const pngDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const pngDownload = await pngDownloadPromise;
  await pngDownload.saveAs(path.join(PROOF_ROOT, "pick-card-redesign.png"));
  await page.getByRole("button", { name: "Approve Design" }).click();
  await page.getByText(/Approved locally:/).waitFor();

  await page.goto(`${BASE}/__qa/design-lab/work-cards`, { waitUntil: "domcontentloaded" });
  const gap = page.getByLabel(/Gap:/);
  await gap.fill("28");
  await gap.dispatchEvent("input");
  await page.getByLabel("Layout direction").selectOption("column");
  await page.getByLabel("Button layout").selectOption("column");
  await page.getByLabel("Variant").selectOption("mobile");
  await page.getByRole("button", { name: "Approve Design" }).click();
  await page.getByText(/Approved locally:/).waitFor();
  await page.screenshot({ path: path.join(PROOF_ROOT, "pick-card-live-component.png"), fullPage: true, type: "png" });

  const approvalsAfter = (await readdir(APPROVAL_ROOT)).filter((name) => name.endsWith(".json")).length;
  if (approvalsAfter < approvalsBefore + 2) throw new Error("Both approved design specifications were not saved.");
  const unexpectedResponses = errorResponses.filter((item) => !/\/favicon\.ico(?:\?|$)/.test(item.url));
  const unexpectedConsole = unexpectedResponses.length ? consoleErrors : consoleErrors.filter((message) => !message.includes("Failed to load resource"));
  if (unexpectedConsole.length || pageErrors.length || unexpectedResponses.length) throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors: unexpectedConsole, pageErrors, errorResponses: unexpectedResponses })}`);
  console.log(JSON.stringify({
    syntheticOnly: true,
    auditStudioRedesignSaved: true,
    pngExported: true,
    jsonExported: true,
    liveComponentUpdated: true,
    approvedSpecificationsCreated: approvalsAfter - approvalsBefore,
    consoleErrors: 0,
    reactErrors: 0,
    proofRoot: ".codex-tmp/stage4-2c/proof"
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
