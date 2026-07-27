import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTURE_RUNNER_VERSION, REQUIRED_SCENARIOS, SCENARIO_VERSION, VIEWPORTS } from "./stage4-5-scenarios.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = path.join(ROOT, "app");
const DOCS = path.join(ROOT, "docs", "qa");
const SHA = process.env.STAGE4_5_SOURCE_SHA || "";

async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

function routeFor(file) {
  const relative = path.relative(APP, file).replaceAll(path.sep, "/").replace(/\/?page\.tsx$/, "");
  return relative ? `/${relative}` : "/";
}

function classify(route) {
  if (["/", "/login", "/forgot-password", "/setup", "/network-blocked"].includes(route)) return "PUBLIC";
  if (route.startsWith("/owner/")) return "OWNER";
  if (route.startsWith("/work/")) return "WORKER";
  return "AUTHENTICATED";
}

async function routes() {
  const files = (await walk(APP)).filter((file) => path.basename(file) === "page.tsx");
  const inventory = files.map((file) => {
    const route = routeFor(file);
    const dynamicParameters = [...route.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
    return {
      route,
      parentRoute: route === "/" ? null : route.split("/").slice(0, -1).join("/") || "/",
      dynamicParameters,
      authentication: classify(route),
      sourceFile: path.relative(ROOT, file).replaceAll(path.sep, "/"),
      captureRequirement: "FULL_PAGE_AT_SIX_RESOLUTIONS",
      status: "INVENTORIED",
    };
  }).sort((a, b) => a.route.localeCompare(b.route));
  await mkdir(DOCS, { recursive: true });
  await writeFile(path.join(DOCS, "PHASE_7_3_6_STAGE4_5_ROUTE_INVENTORY.json"), `${JSON.stringify({ version: SCENARIO_VERSION, routes: inventory }, null, 2)}\n`);
  await writeFile(path.join(DOCS, "PHASE_7_3_6_STAGE4_5_ROUTE_INVENTORY.md"), `# Phase 7.3.6 Stage 4.5 Route Inventory\n\nInventory version: \`${SCENARIO_VERSION}\`\n\nRoutes: ${inventory.length}\n\n| Route | Access | Dynamic parameters | Source | Evidence |\n|---|---|---|---|---|\n${inventory.map((row) => `| \`${row.route}\` | ${row.authentication} | ${row.dynamicParameters.join(", ") || "—"} | \`${row.sourceFile}\` | ${row.captureRequirement} |`).join("\n")}\n`);
  return inventory;
}

async function scenarios() {
  const routeInventory = await routes();
  const sourceScenarios = routeInventory.map((row) => ({
    id: `ROUTE_${row.route.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "ROOT"}`,
    route: row.route,
    role: row.authentication === "PUBLIC" ? "PUBLIC" : "OWNER",
    state: "DEFAULT",
    classification: "SUPPORTED_AND_REACHABLE",
  }));
  const named = REQUIRED_SCENARIOS.map((scenario) => ({ ...scenario, state: scenario.id, classification: "SUPPORTED_AND_REACHABLE" }));
  const combinations = [...named, ...sourceScenarios].flatMap((scenario) => VIEWPORTS.map((viewport) => ({
    combinationId: `${scenario.id}:${viewport.id}`,
    ...scenario,
    viewport,
    evidenceType: "FULL_PAGE",
    required: true,
  })));
  const duplicateIds = combinations.map((row) => row.combinationId).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`Duplicate scenario combinations: ${[...new Set(duplicateIds)].join(", ")}`);
  await writeFile(path.join(DOCS, "PHASE_7_3_6_STAGE4_5_STATE_COMBINATION_MATRIX.json"), `${JSON.stringify({ scenarioVersion: SCENARIO_VERSION, captureRunnerVersion: CAPTURE_RUNNER_VERSION, combinations }, null, 2)}\n`);
  await writeFile(path.join(DOCS, "PHASE_7_3_6_STAGE4_5_STATE_COMBINATION_MATRIX.md"), `# Phase 7.3.6 Stage 4.5 State Combination Matrix\n\n- Scenario version: \`${SCENARIO_VERSION}\`\n- Capture runner: \`${CAPTURE_RUNNER_VERSION}\`\n- Supported full-page combinations: ${combinations.length}\n- Mandatory resolutions: ${VIEWPORTS.map((item) => item.id).join(", ")}\n- Impossible combinations are excluded only when the application source makes them unreachable.\n\nEvery listed combination requires one verified, version-locked full-page PNG.\n`);
  return combinations;
}

async function coverage() {
  const combinations = await scenarios();
  if (!SHA) throw new Error("Set STAGE4_5_SOURCE_SHA to the exact capture commit.");
  const resultPath = path.join(ROOT, ".codex-tmp", "ui-state-atlas", "current", SHA, "browser-results.json");
  const payload = existsSync(resultPath) ? JSON.parse(await readFile(resultPath, "utf8")) : { results: [] };
  const byId = new Map(payload.results.map((row) => [row.id, row]));
  const entries = combinations.map((combination) => {
    const evidence = byId.get(combination.combinationId);
    const verified = evidence?.auditStatus === "VERIFIED"
      && evidence?.fullPageCaptureStatus === "VERIFIED"
      && evidence?.commitSha === SHA
      && evidence?.scenarioVersion === SCENARIO_VERSION
      && evidence?.captureRunnerVersion === CAPTURE_RUNNER_VERSION
      && evidence?.evidenceType === "FULL_PAGE";
    return { ...combination, evidencePath: evidence?.fullPageMasterPath ?? null, sha256: evidence?.fullPageSha256 ?? null, status: verified ? "VERIFIED" : "MISSING_OR_STALE" };
  });
  const uniquePngs = new Set(entries.filter((row) => row.status === "VERIFIED").map((row) => row.sha256)).size;
  const report = {
    sourceSha: SHA,
    scenarioVersion: SCENARIO_VERSION,
    requiredManifestEntries: entries.length,
    verified: entries.filter((row) => row.status === "VERIFIED").length,
    missingOrStale: entries.filter((row) => row.status !== "VERIFIED").length,
    uniqueCanonicalPngs: uniquePngs,
    reusedEntries: entries.filter((row) => row.status === "VERIFIED").length - uniquePngs,
    mixedVersionRejected: payload.results.filter((row) => row.commitSha && row.commitSha !== SHA).length,
    entries,
  };
  const privateRoot = path.dirname(resultPath);
  await mkdir(privateRoot, { recursive: true });
  await writeFile(path.join(privateRoot, "coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, entries: undefined }, null, 2));
  if (report.missingOrStale) process.exitCode = 2;
}

const command = process.argv[2] ?? "scenarios";
if (command === "routes") await routes();
else if (command === "scenarios" || command === "controls") await scenarios();
else if (command === "coverage" || command === "verify" || command === "atlas") await coverage();
else throw new Error(`Unknown Stage 4.5 atlas command: ${command}`);
