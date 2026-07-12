# Phase 7 Browser QA

Automated source and server tests are complete; the following browser checks remain manual. Use fake or sanitized data only.

Test at 360, 390, 430, 768, 1024, and 1440 px:

- Login and account selection.
- Work Hub and Universal Scanner.
- Customer Picker, Assembly, and Packing.
- Consignment Pick, Mark details, and Pack.
- Problems and owner resolution.
- Owner Consignments, import review, Marking Library, Process Rules, and Users.

For every page verify no horizontal page overflow, no bottom-nav overlap, 44 px action targets, wrapped AWB/FNSKU/ASIN, visible scanner input, lazy/fallback images, collapsed long descriptions, worker-hidden owner controls, and obvious read-only states. Measure scan-to-cards, action-to-success, and next-input-focus using a real scanner.
