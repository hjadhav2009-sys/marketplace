import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "app");
const inventoryPath = path.join(
  root,
  "docs",
  "qa",
  "PHASE_7_3_6_SYNTHETIC_COMPLETE_UI_SURFACE_INVENTORY.md",
);
const responsivePath = path.join(
  root,
  "docs",
  "qa",
  "PHASE_7_3_6_SYNTHETIC_RESPONSIVE_RESULTS.md",
);

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const absolute = path.join(directory, name);
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute];
  });
}

const pageFiles = walk(appRoot).filter((file) => path.basename(file) === "page.tsx");
const routes = pageFiles
  .map((file) => {
    const relative = path.relative(appRoot, file).replaceAll(path.sep, "/");
    const route = relative.replace(/\/?page\.tsx$/, "");
    return route ? `/${route}` : "/";
  })
  .sort();

const inventory = readFileSync(inventoryPath, "utf8");
for (const route of routes) {
  assert.match(inventory, new RegExp(`\\\`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\\``));
}
assert.match(inventory, new RegExp(`contains ${routes.length} \\\`page\\.tsx\\\` routes`));

const responsive = readFileSync(responsivePath, "utf8");
for (const viewport of ["360 × 800", "390 × 844", "430 × 932", "768 × 1024", "1024 × 768", "1440 × 900"]) {
  assert.match(responsive, new RegExp(viewport));
}
assert.match(responsive, /BLOCKED_BROWSER_CONTROL_UNAVAILABLE/);

console.log(`Stage 4.2 UI surface inventory tests passed (${routes.length} page routes).`);

