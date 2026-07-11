# Order Assembly Packing Gate

`packCustomerOrderShipmentSafely()` applies the gate inside its final transaction after account authorization and shipment scope resolution.

Packing is allowed when no assembly is required, or the order's Assembly task is `COMPLETED` or `SKIPPED`. It is blocked for required tasks that are missing, `LOCKED`, `READY`, `IN_PROGRESS`, `PROBLEM`, or `CANCELLED`, and for ambiguous/invalid/unsupported customer-order rules.

For Flipkart, the gate checks every active row sharing `accountId + marketplace + Tracking ID`. One blocked sibling prevents every row from packing; no partial shipment update occurs. Already-packed siblings remain outside the active scope.

The browser, universal scanner, direct Pack card, packing detail, and mobile packing endpoint all converge on this shared packing service.
