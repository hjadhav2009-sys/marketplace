import { execFileSync } from "node:child_process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const schemaArgIndex = process.argv.indexOf("--schema");
const forcedSchema = schemaArgIndex >= 0 ? process.argv[schemaArgIndex + 1] : undefined;
const databaseUrl = process.env.DATABASE_URL ?? "";
const schema =
  forcedSchema ??
  (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")
    ? "prisma/schema.postgres.prisma"
    : "prisma/schema.prisma");

function run(command, args) {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", command, ...args], { stdio: "inherit" });
    return;
  }

  execFileSync(command, args, { stdio: "inherit" });
}

run(npx, ["prisma", "generate", "--schema", schema]);
run(npx, ["next", "build"]);
