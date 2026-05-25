import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const port = process.env.PORT?.trim() || "3000";

if (process.env.SKIP_START_PREFLIGHT !== "true") {
  const preflight = spawnSync(process.execPath, ["scripts/check-production-readiness.mjs", "--startup"], {
    stdio: "inherit",
    env: process.env
  });

  if (preflight.status !== 0) {
    process.exit(preflight.status ?? 1);
  }
}

const child = spawn(process.execPath, [nextBin, "start", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
