# Phase 7.3.6 Import and Catalog Hardening

Base: `2804f5f1592f090f8d14bc9ab26ba4c776cd5621` on `phase-7.3.5-recovery-correctness-hardening`.

This phase treats an account with no active work as a valid empty queue, refreshes affected projections when Order Pick tasks are created or safely changed, and refreshes Consignment Pick projections inside activation. Missing projection state with active work still fails closed.

Flipkart Daily Order identity uses normalized `ORDER ITEM ID`, with unambiguous Shipment ID plus Seller SKU fallback. Unchanged existing Orders increment `alreadyImportedRows` and create no issue rows. Exact repeated source rows are aggregated. Conflicting rows sharing an identity create one blocking `DUPLICATE_IDENTITY_CONFLICT` and no Order/task. Operational changes are atomic before work starts and blocking after work starts.

New Order issues do not store raw spreadsheet rows. `safeDataJson` contains only bounded operational review context; buyer, recipient, address, PIN, and invoice fields are omitted.

Missing listings are retained and held from workers. Owners can link an existing account listing, create a minimal draft, or complete a profile-driven listing form. Resolution uses a durable request receipt, synchronizes identifiers, stores only nonblank dynamic attributes, resolves the issue, creates or refreshes one unstarted Pick task, refreshes the projection, emits a live event, and writes audit history. Started immutable snapshots are not rewritten.

The Flipkart main Listing Report profile recognizes the meaningful 75-column header family independent of filename. High-resolution image 1 is preferred, followed by normal image 1, remaining high-resolution URLs, and remaining normal URLs, capped at ten HTTP/HTTPS URLs. Stock and procurement reference columns never become workflow quantity. Seven category-enrichment header families use common identity/pricing fields plus dynamic attributes.

Amazon template forms detect a human-label row and stable technical-key row independent of filename or row position. One selected template renders common fields first and searchable/collapsed advanced fields; macros, formulas, and external links are never executed by this form-schema logic.

Flipkart and Amazon Consignment review now offer both minimal listing creation and the same selected-profile full form. Resolution preserves `Quantity Sent`/`Shipped`, resolves the exact held line idempotently, and never activates the Consignment or creates worker tasks until the owner explicitly activates the reviewed batch.

Automated evidence is recorded by the Phase 7.3.6 focused commands. Browser checks at 360, 390, 430, 768, 1024, and 1440 and sanitized two-worker warehouse QA remain manual release gates. This document does not approve production rollout, merge, deployment, or native Expo work.
