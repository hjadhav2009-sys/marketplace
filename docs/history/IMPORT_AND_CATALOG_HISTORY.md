# Import and catalog history

Early uploads created orders and SKU/image mappings. Flipkart added account-scoped listing master and consignment imports. Amazon added workbook/archive classification, candidate worksheet policy, catalog matching, and snapshot enrichment. ImportJob later represented durable background progress and recovery.

MarketplaceListing is the current catalog center; MarketplaceListingIdentifier enables normalized exact lookup. Imports merge by marketplace identity rules and retain warnings/errors instead of silently guessing. Optional ProductProcessRule selects a route and marking asset; no rule means Pick-Pack.

Amazon reference worksheets are excluded by default. Stored reparsing has limits for file count, aggregate/individual bytes, cells, and archive-derived entries, and submitted worksheet selection is revalidated server-side. Flipkart multi-item shipment safety remains part of packing, not merely parsing.

Phase 7.2B is not implemented on this checkpoint branch. No later bulk-refresh route, migration, catalog-merge service, or test is included in this history. Phase 7.2C is also not implemented.
