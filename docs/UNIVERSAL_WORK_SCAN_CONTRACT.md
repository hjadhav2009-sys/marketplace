# Universal Work Scan Contract

Phase 4 activates this contract at `/work/scan` and in the Universal Scan section of `/packing`.

Input:

```json
{ "code": "FAKE-CODE-001", "actorUserId": "user_fake", "accountId": "optional_account_fake", "intent": "ANY", "limit": 25 }
```

Candidate output:

```json
{
  "candidateKey": "task:task_fake",
  "sourceType": "CONSIGNMENT_TASK",
  "sourceId": "source_fake",
  "taskId": "task_fake",
  "stage": "MARK",
  "status": "READY",
  "accountId": "account_fake",
  "accountName": "Test Account",
  "marketplace": "FLIPKART",
  "productTitle": "Fake Product",
  "productImageUrl": null,
  "matchType": "SELLER_SKU",
  "requiredQuantity": 1,
  "completedQuantity": 0,
  "remainingQuantity": 1,
  "canAct": true
}
```

The resolver searches all authorized active accounts without changing the selected account. It uses indexed exact identifiers, returns multiple cards for multiple active matches, excludes completed work from actionable results, and never changes status from a scan alone. Every explicit action re-authorizes the target account and source on the server.
