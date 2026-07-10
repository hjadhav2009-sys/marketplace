# Future Universal Work Scan Contract

This is a resolver contract only. No universal scanner route or page is activated in Phase 1.

Input:

```json
{ "code": "FAKE-CODE-001", "currentUserId": "user_fake", "selectedAccountId": "account_fake" }
```

Candidate output:

```json
{
  "sourceType": "ORDER",
  "sourceId": "source_fake",
  "taskId": "task_fake",
  "stage": "MARK",
  "status": "READY",
  "accountId": "account_fake",
  "accountName": "Test Account",
  "marketplace": "FLIPKART",
  "productTitle": "Fake Product",
  "imageUrl": null,
  "primaryIdentifier": "FAKE-CODE-001",
  "requiredQuantity": 1,
  "completedQuantity": 0,
  "nextAction": "Open marking task"
}
```

The resolver searches assigned active accounts only; owner may search all active accounts. It uses indexed exact identifiers before any title aid, returns multiple cards for multiple active matches, excludes completed work from actionable results, and never changes status from a scan alone. The worker must explicitly accept an action. The target is fast exact lookup at large listing/task counts.
