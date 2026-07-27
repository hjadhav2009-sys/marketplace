import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const current = path.join(root, ".codex-tmp", "ui-state-atlas", "current");
const archive = path.join(root, ".codex-tmp", "ui-state-atlas", "archive");
const sourceSha = process.argv[2];
if (!sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("Pass the exact 40-character source SHA to archive.");
const from = path.join(current, sourceSha);
const to = path.join(archive, sourceSha);
if (!existsSync(from)) throw new Error(`Current atlas does not exist for ${sourceSha}.`);
if (existsSync(to)) throw new Error(`Historical atlas already exists for ${sourceSha}.`);
await mkdir(archive, { recursive: true });
await rename(from, to);
console.log(JSON.stringify({ archived: sourceSha, destination: to }, null, 2));
