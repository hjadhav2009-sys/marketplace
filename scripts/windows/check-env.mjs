import process from "node:process";
import { loadDotEnv, printEnvironmentSummary, validateEnvironment } from "./env-utils.mjs";

try {
  loadDotEnv(process.cwd());
  const summary = validateEnvironment();

  if (summary.warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of summary.warnings) {
      console.warn(`- ${warning}`);
    }
    console.warn("");
  }

  printEnvironmentSummary(summary);

  if (!summary.ok) {
    console.error("");
    console.error("Environment check failed:");
    for (const error of summary.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("Environment check passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Environment check failed.");
  process.exit(1);
}
