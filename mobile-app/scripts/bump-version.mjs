import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const kind = process.argv[2];
if (!["patch", "minor", "major"].includes(kind)) {
  throw new Error("Use patch, minor, or major.");
}

const root = resolve(import.meta.dirname, "..");
const appPath = resolve(root, "app.json");
const packagePath = resolve(root, "package.json");
const app = JSON.parse(await readFile(appPath, "utf8"));
const pkg = JSON.parse(await readFile(packagePath, "utf8"));
const parts = String(app.expo.version).split(".").map(Number);

if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
  throw new Error("app.json contains an invalid semantic version.");
}

if (kind === "major") {
  parts[0] += 1;
  parts[1] = 0;
  parts[2] = 0;
} else if (kind === "minor") {
  parts[1] += 1;
  parts[2] = 0;
} else {
  parts[2] += 1;
}

const version = parts.join(".");
app.expo.version = version;
app.expo.android.versionCode = Number(app.expo.android.versionCode ?? 0) + 1;
pkg.version = version;

await writeFile(appPath, `${JSON.stringify(app, null, 2)}\n`, "utf8");
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Version ${version}, Android versionCode ${app.expo.android.versionCode}`);
