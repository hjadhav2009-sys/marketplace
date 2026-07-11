import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");
const problems=read("app/work/problems/page.tsx");
const card=read("app/work/WorkTaskCard.tsx");
const access=read("src/lib/workflow/worker-access.ts");
const queues=read("src/lib/workflow/queues.ts");
const taskStore=read("src/lib/workflow/task-store.ts");
const schema=read("prisma/schema.prisma");

assert.match(access,/userCanViewAllConsignmentWork/);
assert.match(access,/userCanResolveConsignmentProblems/);
assert.match(problems,/const canViewAll=/);
assert.match(problems,/const canManage=/);
assert.doesNotMatch(problems,/const manager=.*canViewAllWork/);
assert.match(problems,/canManage\?prisma\.user\.findMany/);
assert.match(card,/getWorkTaskCapabilities/);
assert.match(card,/capabilities\.canProgress/);
assert.match(card,/Read-only work view/);
assert.match(queues,/completedAt:status==="completed"\?\{gte:startOfApplicationDay\(\)\}/);
assert.match(taskStore,/Request ID was already used for a different action/);
assert.match(taskStore,/actorUserId: user\.id, requestKind/);
assert.match(schema,/enum WorkRequestKind/);
assert.match(schema,/@@unique\(\[taskId, actorUserId, requestKind, clientRequestId\]\)/);
assert.doesNotMatch(schema,/model\s+(Inventory|StockLedger|StockBalance)/);

console.log("Workflow hardening source policy tests passed.");
