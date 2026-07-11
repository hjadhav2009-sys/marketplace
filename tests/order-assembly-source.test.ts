import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const schema = read("prisma/schema.prisma");
const mobileStatus = read("mobile-app/package.json");
const assemblyPage = read("app/work/assembly/page.tsx");
const card = read("app/work/assembly/OrderAssemblyCard.tsx");
const navigation = read("components/AppShell.tsx");
const packScope = read("src/lib/workflow/order-pack-scope.ts");
const scanner = read("src/lib/workflow/universal-resolver.ts");
const assembly = read("src/lib/workflow/order-assembly.ts");
const packingDetail = read("app/packing/[awb]/page.tsx");
const scannerPanel = read("components/UniversalScannerPanel.tsx");

assert.match(assemblyPage, /canAssemble/);
assert.match(card, /Assembly Completed/);
assert.match(card, /min-h-11/);
assert.match(navigation, /\/work\/assembly/);
assert.match(packScope, /assertOrderAssemblyPackingEligible/);
assert.match(scanner, /ORDER_WAITING_ASSEMBLY/);
assert.match(scanner, /intent === "ASSEMBLE"/);
assert.match(assembly, /canOfferManualAssemblyDiversion/);
assert.match(packingDetail, /canOfferManualAssemblyDiversion/);
assert.match(scanner, /canOfferManualAssemblyDiversion/);
assert.match(scannerPanel, /manualInstructions/);
assert.match(assembly, /TASK_PROBLEM_REPORTED" \? "PROBLEM"/);
assert.doesNotMatch(schema, /model\s+(Inventory|BillOfMaterials|StockLedger|AssemblyOrder)/);
assert.ok(JSON.parse(mobileStatus).name, "Mobile project remains readable and unchanged by assembly workflow");

console.log("Customer order assembly source policy tests passed.");
