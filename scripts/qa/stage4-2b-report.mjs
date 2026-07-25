import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_SCENARIOS, VIEWPORTS } from "./stage4-2b-scenarios.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const privateRoot = path.join(root, ".codex-tmp", "stage4-2b");
const docsRoot = path.join(root, "docs", "qa");
const sourcePath = path.join(privateRoot, "browser-results.json");
const payload = JSON.parse(await readFile(sourcePath, "utf8"));
const results = payload.results ?? [];
const verified = results.filter((item) => item.auditStatus === "VERIFIED");
const broken = results.filter((item) => item.auditStatus === "BROKEN");
const masters = results.filter((item) => item.fullPageCaptureStatus === "VERIFIED");
const controls = results.flatMap((item) => (item.controls ?? []).map((control) => ({ captureId:item.id,route:item.route,scenario:item.scenarioId,viewport:item.viewport.id,role:item.role,...control})));
const manifest = results.map(({inspection, controls: _controls, failedRequests, errorResponses, consoleErrors, pageErrors, ...item}) => {
  const { controls: _inspectionControls, undersized, ...inspectionSummary } = inspection ?? {};
  void _controls;
  void _inspectionControls;
  return {
    ...item,
    browserScreenshotPath:item.screenshotPath,
    browserTracePath:item.tracePath,
    status:item.auditStatus === "VERIFIED" && item.viewportCaptureStatus === "VERIFIED" && item.fullPageCaptureStatus === "VERIFIED" ? "COMPLETE" : item.auditStatus === "BROKEN" ? "BROKEN" : "NOT_STARTED",
    browserDetails:{inspection:{...inspectionSummary,undersizedCount:undersized?.length??0},failedRequests,errorResponses,consoleErrors,pageErrors},
  };
});
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_CAPTURE_MANIFEST.json"),`${JSON.stringify({generatedAt:payload.summary?.generatedAt,summary:payload.summary,entries:manifest},null,2)}\n`);

const captureManifestMarkdown=`# Phase 7.3.6 Stage 4.2B Capture Manifest

This index is generated from synthetic-only private browser evidence. PNG
masters, viewport captures and traces remain untracked under
\`.codex-tmp/stage4-2b/\`.

- Entries: ${manifest.length}
- Complete: ${manifest.filter((item)=>item.status==="COMPLETE").length}
- Broken: ${manifest.filter((item)=>item.status==="BROKEN").length}
- Missing or incomplete: ${manifest.filter((item)=>item.status!=="COMPLETE").length}

| Capture | Route | State | Role | Viewport | Viewport evidence | Full-page master | Controls | Status |
|---|---|---|---|---|---|---|---:|---|
${manifest.map((item)=>`| ${item.id} | \`${item.route}\` | ${item.scenarioId} | ${item.role} | ${item.viewport.id} | ${item.viewportCaptureStatus??"NOT_STARTED"} | ${item.fullPageCaptureStatus??"NOT_STARTED"} | ${item.controlCount??0} | ${item.status} |`).join("\n")}
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_CAPTURE_MANIFEST.md"),captureManifestMarkdown);

const byViewport=VIEWPORTS.map(viewport=>{const rows=results.filter(item=>item.viewport.id===viewport.id);return{viewport:viewport.id,total:rows.length,verified:rows.filter(item=>item.auditStatus==="VERIFIED").length,broken:rows.filter(item=>item.auditStatus==="BROKEN").length,controls:rows.reduce((sum,item)=>sum+item.controlCount,0)};});
const browserIndex=`# Phase 7.3.6 Stage 4.2B Browser Capture Index

Generated from the private synthetic Playwright evidence. Screenshot and trace
files remain ignored under \`.codex-tmp/stage4-2b/\`.

- Browser: ${payload.summary?.browserEngine}
- Captures: ${results.length}
- Verified: ${verified.length}
- Broken: ${broken.length}
- Visible controls inventoried: ${controls.length}
- Failure traces: ${results.filter(item=>item.tracePath).length}
- Full-page high-resolution masters: ${masters.length}
- Full-page storage: ${masters.reduce((sum,item)=>sum+(item.fullPageFileBytes??0),0).toLocaleString()} bytes

| Scenario | Route | Role | Viewport | Controls | Viewport | Full page | Master |
|---|---|---|---|---:|---|---|---|
${results.map(item=>`| ${item.scenarioId} | \`${item.route}\` | ${item.role} | ${item.viewport.id} | ${item.controlCount} | ${item.viewportCaptureStatus??"NOT_STARTED"} | ${item.fullPageCaptureStatus??"NOT_STARTED"} | \`${item.fullPageMasterPath??"-"}\` |`).join("\n")}
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_BROWSER_CAPTURE_INDEX.md"),browserIndex);

const clickPaths=`# Phase 7.3.6 Stage 4.2B Complete Click Paths

This is the machine-generated visible-control inventory. A control is not
classified as interaction-complete merely because it rendered.

| Capture | Route | Viewport | Control | Type | Enabled | Destination/action |
|---|---|---|---|---|---|---|
${controls.map(item=>`| ${item.scenario} | \`${item.route}\` | ${item.viewport} | ${String(item.label||"(unlabelled)").replaceAll("|","/")} | ${item.tag}/${item.type||"-"} | ${!item.disabled} | \`${item.href??item.formAction??"-"}\` |`).join("\n")}
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_COMPLETE_CLICK_PATHS.md"),clickPaths);

const responsive=`# Phase 7.3.6 Stage 4.2B Responsive Results

| Viewport | Captures | Verified | Broken | Controls |
|---|---:|---:|---:|---:|
${byViewport.map(item=>`| ${item.viewport} | ${item.total} | ${item.verified} | ${item.broken} | ${item.controls} |`).join("\n")}

Mandatory completion requires zero unexplained broken results and complete
interaction coverage, not only rendered-state verification.
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_RESPONSIVE_RESULTS.md"),responsive);

const findings=`# Phase 7.3.6 Stage 4.2B UI/UX Findings

## Browser findings

${broken.length?broken.map(item=>{
  const missingState=item.status===404||item.inspection?.heading==="404";
  const severity=item.pageErrors?.length?"HIGH":missingState?"TEST_GAP":"MEDIUM";
  const diagnostic=item.error??item.pageErrors?.join(" | ")??(item.inspection?.overflow?"Horizontal overflow detected.":missingState?"Canonical synthetic seed does not provide this reachable detail state.":"Runtime verification failed.");
  return `### ${item.id}\n\n- Severity: ${severity}\n- Route: \`${item.route}\`\n- Viewport: ${item.viewport.id}\n- HTTP/heading: ${item.status} / ${item.inspection?.heading??"-"}\n- Viewport evidence: ${item.viewportCaptureStatus??"NOT_STARTED"}\n- Full-page evidence: ${item.fullPageCaptureStatus??"NOT_STARTED"}\n- Diagnostic: ${diagnostic}\n- Evidence: \`${item.tracePath??item.screenshotPath}\`\n`;
}).join("\n"):"No browser-rendering failures were recorded in this generated batch."}

## Completion caution

Rendered controls remain separate from click-complete controls. Any unexercised
mutation, dialog, drawer or validation branch keeps Stage 4.2B incomplete.
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_UI_UX_FINDINGS.md"),findings);

const stateCatalog=`# Phase 7.3.6 Stage 4.2B Synthetic State Catalog

Canonical seed: \`phase-7.3.6-stage4.2-synthetic-ui-v2\`.

| Scenario | Route | Role | Captures |
|---|---|---|---:|
${REQUIRED_SCENARIOS.map(scenario=>`| ${scenario.id} | \`${scenario.route}\` | ${scenario.role} | ${results.filter(item=>item.scenarioId===scenario.id).length} |`).join("\n")}
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_SYNTHETIC_STATE_CATALOG.md"),stateCatalog);

const inventory=`# Phase 7.3.6 Stage 4.2B Complete UI Surface Inventory

The authoritative 64-page source inventory remains in
\`PHASE_7_3_6_SYNTHETIC_COMPLETE_UI_SURFACE_INVENTORY.md\`.

- Required deterministic scenarios: ${REQUIRED_SCENARIOS.length}
- Required viewports: ${VIEWPORTS.length}
- Browser entries produced: ${results.length}
- Unique routes captured: ${new Set(results.map(item=>item.route)).size}
- Unique states captured: ${new Set(results.map(item=>item.scenarioId)).size}
- Visible controls recorded: ${controls.length}
- Broken entries: ${broken.length}
- Verified full-page masters: ${masters.length}
- Missing full-page masters: ${results.length-masters.length}
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_COMPLETE_UI_SURFACE_INVENTORY.md"),inventory);

const studioGuide=`# Phase 7.3.6 Stage 4.2B Local Audit Studio Guide

1. Prepare/build/start private synthetic staging with the reviewed \`staging:*\` commands.
2. Run \`npm.cmd run stage4-2b:browser -- --resume\`.
3. Open http://127.0.0.1:3188/__qa/ui-audit
4. Filter by route, role, viewport or status.
5. Use Current, Redesign and Notes; add overlays and review tags.
6. Save privately or export sanitized JSON.
7. Stop with \`npm.cmd run staging:stop\`.

Synthetic credentials remain in the ignored Stage 3 credential file. Passwords
must not be copied into documentation. Without \`STAGING_UI_AUDIT=true\`, the
Studio and its private APIs return 404.
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_LOCAL_AUDIT_STUDIO_GUIDE.md"),studioGuide);

const designGuide=`# Phase 7.3.6 Stage 4.2B Design Lab Guide

Open http://127.0.0.1:3188/__qa/design-lab in private synthetic staging.

Available galleries: design system, navigation, dashboard, Product Inventory,
Product Details, imports, work cards, route dialogs, scanner, problems, Data
Management and empty/loading/error.

Each gallery presents Current, Draft A and Draft B. These are audit-only
synthetic component variants and do not call production business mutations.
Without \`STAGING_UI_AUDIT=true\`, all Design Lab routes return 404.
`;
await writeFile(path.join(docsRoot,"PHASE_7_3_6_STAGE4_2B_DESIGN_LAB_GUIDE.md"),designGuide);

console.log(JSON.stringify({captures:results.length,verified:verified.length,broken:broken.length,controls:controls.length},null,2));
