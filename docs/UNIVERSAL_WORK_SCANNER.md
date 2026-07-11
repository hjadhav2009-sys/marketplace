# Universal Work Scanner

Open `/work/scan` or the Universal Scan section at `/packing`.

1. Scan or enter an AWB, Tracking ID, order code, SKU, FSN, listing ID, barcode, consignment number, or supported work-task ID.
2. Optionally choose Pick, Mark, Assemble, Pack, or one authorized account.
3. Review every exact active match. Account, marketplace, source, stage, assignment, and quantities are shown on each card.
4. Select an explicit action. A scan by itself never changes work.
5. Scan again after the success or refresh-required message.

Hardware scanners that type a code followed by Enter work with the focused input. CR/LF suffixes are trimmed safely. Browser/native camera availability is separate from this resolver; the existing customer-order scanner remains available in the secondary Packing section.

Completed work is not actionable. When only completed matches exist, the page reports that matching work is already completed without presenting a completed card. A stale card is re-authorized and rejected safely; the worker scans again rather than replaying a mutation automatically.

For customer-order Assembly, required work appears as a Send to Assembly or Assembly task card. Packers without assembly permission see a read-only waiting state. Completing Assembly restores the Pack candidate; scanning alone never sends or completes work.

This feature does not track inventory. Product Design Identity and Windows Worker Agent work remain separate roadmap items.
