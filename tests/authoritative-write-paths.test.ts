import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";

const TRACKED_SOURCE_PATTERN = /^(app|lib|src|scripts)\/.*\.(?:ts|tsx|mjs)$/;
const MUTATION_OPERATIONS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert"
] as const;

// Keep this list explicit. A newly introduced write to one of these operational
// models must be routed through an exact, reviewed path below.
const SENSITIVE_MODELS = [
  "account",
  "auditLog",
  "consignmentBatch",
  "consignmentImportFile",
  "consignmentImportIssue",
  "consignmentLine",
  "importJob",
  "importRowIssue",
  "markingAsset",
  "markingAssetFile",
  "markingAssetListingLink",
  "marketplaceFileProfile",
  "marketplaceListing",
  "marketplaceListingAttribute",
  "marketplaceListingIdentifier",
  "order",
  "passwordResetRequest",
  "problemOrder",
  "productProcessRule",
  "scanLog",
  "securityThrottle",
  "skuImageMapping",
  "uploadBatch",
  "uploadPreviewRow",
  "user",
  "userDeviceSession",
  "workActionLog",
  "workChangeEvent",
  "workGroupMember",
  "workGroupProjection",
  "workRouteDecision",
  "workRouteDecisionRejection",
  "workflowActionReceipt",
  "workProjectionState",
  "workTask"
] as const;

type SensitiveMutation = {
  path: string;
  line: number;
  model: string;
  operation: string;
};

const sensitiveModelSet = new Set<string>(SENSITIVE_MODELS);
const mutationOperationSet = new Set<string>(MUTATION_OPERATIONS);
const schemaModels = [...readFileSync("prisma/schema.prisma", "utf8").matchAll(/^model\s+([A-Za-z_]\w*)\s*\{/gm)]
  .map(match => `${match[1][0].toLowerCase()}${match[1].slice(1)}`)
  .sort();
assert.deepEqual(
  [...sensitiveModelSet].sort(),
  schemaModels,
  "Every Prisma model must remain inside the authoritative write-path policy."
);

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function memberName(expression: ts.Expression): string | null {
  const current = unwrapExpression(expression);
  if (ts.isPropertyAccessExpression(current)) return current.name.text;
  if (ts.isElementAccessExpression(current)) {
    const argument = current.argumentExpression && unwrapExpression(current.argumentExpression);
    return argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
      ? argument.text
      : null;
  }
  return null;
}

function memberReceiver(expression: ts.Expression): ts.Expression | null {
  const current = unwrapExpression(expression);
  return ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)
    ? current.expression
    : null;
}

function scriptKind(path: string) {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".mjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function scanSensitiveMutations(path: string, source: string): SensitiveMutation[] {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const delegatedModels = new Map<string, string>();

  const modelFor = (expression: ts.Expression): string | null => {
    const current = unwrapExpression(expression);
    if (ts.isIdentifier(current)) return delegatedModels.get(current.text) ?? null;
    const name = memberName(current);
    return name && sensitiveModelSet.has(name) ? name : null;
  };

  // Resolve simple delegate aliases to a fixed point, including bracket access,
  // destructuring, and chains such as `const rows = listings`.
  let changed = true;
  while (changed) {
    changed = false;
    const discover = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name)) {
          const model = modelFor(node.initializer);
          if (model && delegatedModels.get(node.name.text) !== model) {
            delegatedModels.set(node.name.text, model);
            changed = true;
          }
        } else if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (!ts.isIdentifier(element.name)) continue;
            const property = element.propertyName && (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName))
              ? element.propertyName.text
              : element.name.text;
            if (sensitiveModelSet.has(property) && delegatedModels.get(element.name.text) !== property) {
              delegatedModels.set(element.name.text, property);
              changed = true;
            }
          }
        }
      }
      ts.forEachChild(node, discover);
    };
    discover(sourceFile);
  }

  const mutations: SensitiveMutation[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const operation = memberName(node.expression);
      const receiver = memberReceiver(node.expression);
      const model = receiver ? modelFor(receiver) : null;
      if (model && operation && mutationOperationSet.has(operation)) {
        mutations.push({
          path,
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
          model,
          operation
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return mutations;
}

// These are exact reviewed entry points retained for compatibility. They are
// intentionally not directory patterns.
const reviewedActionAndRoutePaths = [
  "app/api/mobile/accounts/select/route.ts",
  "app/api/mobile/auth/change-password/route.ts",
  "app/api/mobile/auth/login/route.ts",
  "app/api/mobile/packing/search/route.ts",
  "app/change-password/actions.ts",
  "app/forgot-password/actions.ts",
  "app/login/actions.ts",
  "app/owner/cleanup/actions.ts",
  "app/owner/accounts/actions.ts",
  "app/owner/consignments/actions.ts",
  "app/owner/marking-library/actions.ts",
  "app/owner/old-pending/actions.ts",
  "app/owner/process-rules/actions.ts",
  "app/owner/sku-mappings/actions.ts",
  "app/owner/uploads/actions.ts",
  "app/owner/users/actions.ts",
  "app/packing/actions.ts",
  "app/problems/actions.ts",
  "app/setup/actions.ts",
  "app/work/tasks/[taskId]/marking-file/route.ts"
] as const;

const reviewedDomainServicePaths = [
  "lib/account-lifecycle.ts",
  "lib/audit.ts",
  "lib/auth.ts",
  "lib/cleanup.ts",
  "lib/import/orders.ts",
  "lib/import/sku-mappings.ts",
  "lib/security-throttle.ts",
  "src/lib/catalog/manual-listing.ts",
  "src/lib/catalog/missing-listing-resolution.ts",
  "src/lib/consignments/adaptive-mapping.ts",
  "src/lib/consignments/amazon/import-service.ts",
  "src/lib/consignments/import-service.ts",
  "src/lib/consignments/resume-mapped-import.ts",
  "src/lib/import-jobs/runner.ts",
  "src/lib/import-jobs/store.ts",
  "src/lib/imports/adaptive-rows.ts",
  "src/lib/imports/header-profiles.ts",
  "src/lib/marketplaces/flipkart/import.ts",
  "src/lib/marking/identifiers.ts",
  "src/lib/marking/library.ts",
  "src/lib/marking/process-rules.ts",
  "src/lib/product-inventory/jobs.ts",
  "src/lib/product-inventory/merge.ts",
  "src/lib/workflow/grouped-progress.ts",
  "src/lib/workflow/grouped-transition.ts",
  "src/lib/workflow/live-work.ts",
  "src/lib/workflow/order-assembly.ts",
  "src/lib/workflow/order-pack-scope.ts",
  "src/lib/workflow/order-picking.ts",
  "src/lib/workflow/order-problems.ts",
  "src/lib/workflow/order-route-tasks.ts",
  "src/lib/workflow/route-selection.ts",
  "src/lib/workflow/route-decision-rejection.ts",
  "src/lib/workflow/stage-transition.ts",
  "src/lib/workflow/task-store.ts",
  "src/lib/workflow/work-group-projection.ts",
  "src/lib/workflow/workflow-action-receipt.ts"
] as const;

const reviewedOperationalScriptPaths = [
  "scripts/grouped-work-performance.ts",
  "scripts/operational-retention.ts",
  "scripts/phase7-scale-data.ts",
  "scripts/workflow-activation-benchmark.ts",
  "scripts/repair-legacy-order-workflow.ts"
] as const;

const reviewedMutationPaths = new Set<string>([
  ...reviewedActionAndRoutePaths,
  ...reviewedDomainServicePaths,
  ...reviewedOperationalScriptPaths
]);

assert.ok(
  [...reviewedMutationPaths].every(path => !/[?*{}]/.test(path)),
  "Authoritative write-path entries must be exact paths; wildcards are forbidden."
);
assert.equal(reviewedMutationPaths.has("src/lib/catalog/manual-listing.ts"), true);
assert.equal(reviewedMutationPaths.has("src/lib/catalog/missing-listing-resolution.ts"), true);
assert.equal(reviewedMutationPaths.has("app/owner/product-inventory/manual-actions.ts"), false);

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(path => TRACKED_SOURCE_PATTERN.test(path));
const callSites = tracked.flatMap(path => scanSensitiveMutations(path, readFileSync(path, "utf8")));
const foundPaths = [...new Set(callSites.map(site => site.path))];
const unreviewed = foundPaths.filter(path => !reviewedMutationPaths.has(path));
assert.deepEqual(
  unreviewed,
  [],
  `Sensitive mutations require authoritative-path review: ${unreviewed.join(", ")}`
);

// The Product Inventory action is deliberately a transport adapter. Its
// transaction and sensitive writes belong to manual-listing.ts.
const manualActionsPath = "app/owner/product-inventory/manual-actions.ts";
const manualActions = readFileSync(manualActionsPath, "utf8");
assert.doesNotMatch(manualActions, /(?:from|require\s*\()\s*["']@\/lib\/prisma["']/);
assert.doesNotMatch(manualActions, /\$(?:transaction|executeRaw|executeRawUnsafe)\s*\(/);
assert.deepEqual(
  scanSensitiveMutations(manualActionsPath, manualActions),
  [],
  "manual-actions.ts must not perform sensitive Prisma mutations directly."
);
const manualLockActionsPath = "app/owner/product-inventory/[listingId]/actions.ts";
const manualLockActions = readFileSync(manualLockActionsPath, "utf8");
assert.equal(reviewedMutationPaths.has(manualLockActionsPath), false);
assert.doesNotMatch(manualLockActions, /(?:from|require\s*\()\s*["']@\/lib\/prisma["']/);
assert.doesNotMatch(manualLockActions, /\$(?:transaction|executeRaw|executeRawUnsafe)\s*\(/);
assert.deepEqual(scanSensitiveMutations(manualLockActionsPath, manualLockActions), [], "Catalog lock actions must call the authoritative manual-listing service.");

// Prove that the scanner still rejects a newly introduced direct write even
// when all repository paths are currently reviewed.
const negativeFixturePath = "app/__policy_fixture__/unreviewed-action.ts";
const negativeFixture = scanSensitiveMutations(
  negativeFixturePath,
  [
    'import { prisma as orm } from "@/lib/prisma";',
    'await orm.marketplaceListing.create({ data: payload });',
    'await orm["marketplaceListing"]["updateManyAndReturn"]({ data: payload });',
    'const listingDelegate = orm.marketplaceListing;',
    'await listingDelegate.createManyAndReturn({ data: payload });',
    'const delegatedAgain = listingDelegate;',
    'await delegatedAgain.upsert({ where, create: payload, update: payload });',
    'const { workTask: taskDelegate } = orm;',
    'await taskDelegate.deleteMany({ where });'
  ].join("\n")
);
assert.deepEqual(
  negativeFixture.map(({ path, model, operation }) => ({ path, model, operation })),
  [
    { path: negativeFixturePath, model: "marketplaceListing", operation: "create" },
    { path: negativeFixturePath, model: "marketplaceListing", operation: "updateManyAndReturn" },
    { path: negativeFixturePath, model: "marketplaceListing", operation: "createManyAndReturn" },
    { path: negativeFixturePath, model: "marketplaceListing", operation: "upsert" },
    { path: negativeFixturePath, model: "workTask", operation: "deleteMany" }
  ]
);
assert.equal(reviewedMutationPaths.has(negativeFixturePath), false);
assert.deepEqual(
  [...new Set(negativeFixture.map(site => site.path))].filter(path => !reviewedMutationPaths.has(path)),
  [negativeFixturePath],
  "A newly introduced direct mutation must remain unreviewed until its exact path is approved."
);

type RawSqlMutation = {
  path: string;
  line: number;
  method: "$executeRaw" | "$executeRawUnsafe";
  fingerprint: string;
};

function rawSqlFingerprint(node: ts.Node, sourceFile: ts.SourceFile) {
  const reviewedSource = node.getText(sourceFile).replace(/\r\n/g, "\n").trim();
  return createHash("sha256").update(reviewedSource).digest("hex");
}

function scanRawSqlMutations(path: string, source: string): RawSqlMutation[] {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const found: RawSqlMutation[] = [];
  const record = (node: ts.CallExpression | ts.TaggedTemplateExpression, target: ts.Expression) => {
    const method = memberName(target);
    if (method !== "$executeRaw" && method !== "$executeRawUnsafe") return;
    found.push({
      path,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      method,
      fingerprint: rawSqlFingerprint(node, sourceFile)
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) record(node, node.expression);
    else if (ts.isTaggedTemplateExpression(node)) record(node, node.tag);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

const rawSqlCallSites = tracked.flatMap(path => scanRawSqlMutations(path, readFileSync(path, "utf8")));
const reviewedRawSqlOccurrences = [
  // Each entry binds one reviewed SQL expression to its path. Moving lines is
  // harmless; changing the statement or adding another statement requires review.
  "src/lib/import-jobs/store.ts:$executeRaw:fdf5aafe0dd292d7b76ccebc60593104122fc96648ab3e3e87f76aad981de19d",
  "src/lib/import-jobs/store.ts:$executeRaw:da5a6fcdea653f138a17ab75e968bd715fac74cfc7ff3e8d7cf534affdb413f5",
  "src/lib/import-jobs/store.ts:$executeRaw:f7397d844aa7bbd01b341ec16b2c462eca150bd62c06ecf6c529f6825378cd8f",
  "src/lib/import-jobs/store.ts:$executeRaw:137e671e967cb34d4b0c7d8541b3c3b484930364debf96e4222be578ca46cb4e",
  "src/lib/workflow/task-store.ts:$executeRaw:65c6e2710ef47048036807b3d430d8af009e56891343205a78b3f898fa315b6d"
] as const;
const rawSqlId = (site: RawSqlMutation) => `${site.path}:${site.method}:${site.fingerprint}`;
const actualRawSqlOccurrences = rawSqlCallSites.map(rawSqlId).sort();
assert.deepEqual(
  actualRawSqlOccurrences,
  [...reviewedRawSqlOccurrences].sort(),
  `Raw SQL mutations must exactly match reviewed source fingerprints: ${actualRawSqlOccurrences.join(", ")}`
);

const changedRawSqlFixture = scanRawSqlMutations(
  "src/lib/workflow/task-store.ts",
  'await tx.$executeRaw(Prisma.sql`DELETE FROM "WorkTask"`);'
);
assert.equal(changedRawSqlFixture.length, 1);
assert.equal(
  reviewedRawSqlOccurrences.includes(rawSqlId(changedRawSqlFixture[0]) as typeof reviewedRawSqlOccurrences[number]),
  false,
  "A different raw mutation in an otherwise reviewed file must still require review."
);

const taskStore = readFileSync("src/lib/workflow/task-store.ts", "utf8");
const card = readFileSync("app/work/WorkTaskCard.tsx", "utf8");
const statusRoute = readFileSync("app/owner/imports/[jobId]/status/route.ts", "utf8");
assert.match(taskStore, /task\.stage === "PACK"[\s\S]{0,120}Packing must use the authoritative Pack Completed action/);
assert.match(card, /task\.stage!=="PACK"/);
assert.doesNotMatch(statusRoute, /startImportJob|startProductInventoryJob/);

console.log(
  `Authoritative write-path policy passed for ${callSites.length} exact ORM and ${rawSqlCallSites.length} raw-SQL mutation call sites across ${foundPaths.length} reviewed files; semantic correctness remains covered by service tests.`
);
