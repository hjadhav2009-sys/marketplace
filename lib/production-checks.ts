import { verifyPassword } from "./password";

export type ProductionCheckStatus = "OK" | "WARNING" | "NEEDS_ACTION";

export type ProductionCheck = {
  key: string;
  label: string;
  status: ProductionCheckStatus;
  message: string;
};

export type DemoUserSnapshot = {
  username: string;
  active: boolean;
  passwordHash?: string | null;
  mustChangePassword?: boolean | null;
};

export type ProductionCheckInput = {
  nodeEnv?: string;
  sessionSecret?: string;
  nextPublicAppUrl?: string;
  databaseUrl?: string;
  localNetworkOnly?: string;
  demoUsers?: DemoUserSnapshot[];
  skuMappingCount?: number;
  oldPreviewRowCount?: number;
  oldImportIssueCount?: number;
  oldScanLogCount?: number;
  oldAuditLogCount?: number;
};

const demoUsernames = new Set(["owner", "picker", "packer"]);

function statusForProduction(input: ProductionCheckInput, status: ProductionCheckStatus) {
  return input.nodeEnv === "production" ? status : status === "NEEDS_ACTION" ? "WARNING" : status;
}

export function runProductionChecks(input: ProductionCheckInput): ProductionCheck[] {
  const checks: ProductionCheck[] = [];
  const isProduction = input.nodeEnv === "production";
  const sessionSecret = input.sessionSecret ?? "";
  const databaseUrl = input.databaseUrl ?? "";
  const activeDemoUsers = (input.demoUsers ?? []).filter((user) => demoUsernames.has(user.username) && user.active);
  const demoPasswordUsers = activeDemoUsers.filter(
    (user) => typeof user.passwordHash === "string" && verifyPassword("demo1234", user.passwordHash)
  );

  checks.push({
    key: "node-env",
    label: "Environment mode",
    status: isProduction ? "OK" : "WARNING",
    message: isProduction ? "Running in production mode." : `Running in ${input.nodeEnv ?? "unknown"} mode.`
  });

  checks.push({
    key: "session-secret",
    label: "Session secret",
    status: sessionSecret.length >= 32 && sessionSecret !== "dev-only-change-me" ? "OK" : statusForProduction(input, "NEEDS_ACTION"),
    message:
      sessionSecret.length >= 32 && sessionSecret !== "dev-only-change-me"
        ? "SESSION_SECRET is set with acceptable length."
        : "Set SESSION_SECRET to a private random value of at least 32 characters."
  });

  checks.push({
    key: "app-url",
    label: "App URL",
    status: input.nextPublicAppUrl || !isProduction ? "OK" : "NEEDS_ACTION",
    message: input.nextPublicAppUrl ? `NEXT_PUBLIC_APP_URL is ${input.nextPublicAppUrl}.` : "Set NEXT_PUBLIC_APP_URL before production deployment."
  });

  checks.push({
    key: "database-url",
    label: "Production database",
    status: !isProduction || databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://") ? "OK" : "NEEDS_ACTION",
    message:
      !isProduction || databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")
        ? "Database URL is compatible with the current environment."
        : "Production must use Supabase PostgreSQL, not SQLite."
  });

  checks.push({
    key: "local-network-only",
    label: "Hostinger network setting",
    status: isProduction && input.localNetworkOnly === "true" ? "WARNING" : "OK",
    message:
      isProduction && input.localNetworkOnly === "true"
        ? "LOCAL_NETWORK_ONLY should be false for Hostinger production."
        : "LOCAL_NETWORK_ONLY setting is acceptable."
  });

  checks.push({
    key: "demo-users",
    label: "Demo users",
    status: activeDemoUsers.length > 0 ? "WARNING" : "OK",
    message:
      activeDemoUsers.length > 0
        ? `Seed usernames still active: ${activeDemoUsers.map((user) => user.username).join(", ")}.`
        : "Seed demo usernames are inactive or removed."
  });

  checks.push({
    key: "demo-passwords",
    label: "Demo passwords",
    status: demoPasswordUsers.length > 0 ? "NEEDS_ACTION" : "OK",
    message:
      demoPasswordUsers.length > 0
        ? `Demo password still detected for: ${demoPasswordUsers.map((user) => user.username).join(", ")}.`
        : "No active seed user is using the demo password."
  });

  checks.push({
    key: "sku-mappings",
    label: "SKU mappings",
    status: (input.skuMappingCount ?? 0) > 0 ? "OK" : "WARNING",
    message: (input.skuMappingCount ?? 0) > 0 ? "SKU image mappings exist." : "Import SKU image mappings before daily use."
  });

  checks.push({
    key: "old-preview-rows",
    label: "Old preview rows",
    status: (input.oldPreviewRowCount ?? 0) > 5000 ? "WARNING" : "OK",
    message: `${input.oldPreviewRowCount ?? 0} old upload preview rows are eligible for cleanup.`
  });

  checks.push({
    key: "old-import-issues",
    label: "Old import issues",
    status: (input.oldImportIssueCount ?? 0) > 5000 ? "WARNING" : "OK",
    message: `${input.oldImportIssueCount ?? 0} old import issues are eligible for cleanup.`
  });

  checks.push({
    key: "old-scan-logs",
    label: "Old scan logs",
    status: (input.oldScanLogCount ?? 0) > 50000 ? "WARNING" : "OK",
    message: `${input.oldScanLogCount ?? 0} old scan logs are eligible for cleanup.`
  });

  checks.push({
    key: "old-audit-logs",
    label: "Old audit logs",
    status: (input.oldAuditLogCount ?? 0) > 50000 ? "WARNING" : "OK",
    message: `${input.oldAuditLogCount ?? 0} old audit logs are eligible for cleanup.`
  });

  return checks;
}

export function summarizeProductionChecks(checks: ProductionCheck[]): ProductionCheckStatus {
  if (checks.some((check) => check.status === "NEEDS_ACTION")) {
    return "NEEDS_ACTION";
  }

  if (checks.some((check) => check.status === "WARNING")) {
    return "WARNING";
  }

  return "OK";
}
