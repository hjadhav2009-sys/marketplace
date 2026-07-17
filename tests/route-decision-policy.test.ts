import assert from "node:assert/strict";
import { getRouteDecisionPolicy, sanitizeRouteNote, validateRouteDecisionReason } from "../src/lib/workflow/route-decision-policy";

const routes = ["MARK", "ASSEMBLE", "PACK"] as const;
for (const savedNextStage of routes) {
  for (const selectedNextStage of routes) {
    const policy = getRouteDecisionPolicy({ hasExplicitSavedRoute: true, savedRoute: "PICK_MARK_PACK", savedNextStage, selectedNextStage });
    assert.equal(policy.decisionType, savedNextStage === selectedNextStage ? "FOLLOWED_SAVED_ROUTE" : "OVERRIDDEN_SAVED_ROUTE");
    assert.equal(policy.reasonRequired, savedNextStage !== selectedNextStage);
    assert.equal(policy.ownerApprovalRequired, false);
  }
}
for (const selectedNextStage of routes) {
  const policy = getRouteDecisionPolicy({ hasExplicitSavedRoute: false, savedRoute: null, savedNextStage: "PACK", selectedNextStage });
  assert.equal(policy.decisionType, "SELECTED_FROM_SYSTEM_FALLBACK");
  assert.equal(policy.reasonRequired, false);
  assert.equal(policy.ownerApprovalRequired, false);
  assert.equal(validateRouteDecisionReason({ required: false, reason: undefined }), null);
}
assert.throws(() => validateRouteDecisionReason({ required: true, reason: undefined }), /Choose/);
assert.equal(validateRouteDecisionReason({ required: true, reason: "Assembly required" }), "Assembly required");
assert.equal(validateRouteDecisionReason({ required: true, reason: "Other", otherReason: "  Needs\u0000 special   handling  " }), "Needs special handling");
assert.equal(sanitizeRouteNote("x".repeat(500)).length, 240);
console.log("Route decision policy tests passed.");
