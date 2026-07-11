# Consignment Packing

Open `/work/consignments/pack`. Only active READY or IN_PROGRESS PACK tasks appear, and earlier stages must have completed before PACK becomes ready. Exact identifiers and consignment numbers can locate active candidates; multiple matches remain separate and require worker selection.

Completing final PACK timestamps the line. Central reconciliation marks the batch COMPLETED only after every final PACK task is complete. Completed tasks disappear from active search but remain available under completed history.

This stage is separate from customer-order AWB packing. A universal cross-order and cross-account scanner remains a later phase.
