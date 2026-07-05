# Flipkart Fake Fixtures

These `.xlsx` files are generated fake fixtures for parser/import tests only.

They do not contain real customer data, phone numbers, addresses, invoices, labels, or private Flipkart exports. Tracking IDs use masked `FMPC0000000000` style values, names are `Test Buyer` / `Test Receiver`, and address fields are masked.

Regenerate with:

```bash
node tests/fixtures/flipkart/generate-fixtures.mjs
```
