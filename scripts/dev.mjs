import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const args = process.argv.slice(2);
const nextArgs = ["dev"];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === "--host") {
    nextArgs.push("--hostname");
    if (args[index + 1]) {
      nextArgs.push(args[index + 1]);
      index += 1;
    }
    continue;
  }

  if (arg.startsWith("--host=")) {
    nextArgs.push(`--hostname=${arg.slice("--host=".length)}`);
    continue;
  }

  nextArgs.push(arg);
}

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

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
