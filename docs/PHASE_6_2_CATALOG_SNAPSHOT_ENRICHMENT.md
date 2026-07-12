# Phase 6.2 Catalog Snapshot Enrichment

Amazon tables now carry explicit sheet usage and priority. Only operational or unknown data sheets may participate in identity, enrichment, or shipment quantities; reference sheets remain stored but inert.

Catalog authority produces `AmazonListingEnrichmentV1` values keyed by listing ID. Immutable consignment snapshots combine listing identity, authoritative catalog attributes, and shipment fallback, including material, color, size, model, description, bullets, and up to ten safe deduplicated images.

This correction changes no mobile, inventory, ERP, EngravingBrain, or Worker Agent behavior.
