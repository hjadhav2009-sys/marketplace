# Workflow and permission history

Workflow began with marking/process/task foundations, then added Flipkart activation and worker Pick/Mark/Pack, hardened request replay and permissions, unified scanning and packing safety, and added customer Assembly. Amazon later reused the consignment model with marketplace-specific parsing and snapshots.

Capabilities are explicit: pick, pack, mark, assemble, report problem, manage marking library, manage process rules, view all work, view/import/manage consignments. Selected and assigned seller accounts constrain access. Owners manage configuration and imports; workers see and mutate only authorized stage/account work; view-all access does not imply mutation.

Task progression is ordered. Locked future stages cannot start early. Problems preserve recoverable prior state. Assignments, claims, quantities, completion, and action logs are checked together. Client request identity prevents duplicate effects. Shipment-level packing checks prevent one line from being packed while related required work is incomplete.

Known limitation: the high-contention 2/5/10/20 test applies specifically to duplicate quantity increments. Some other action families have two-request or targeted competition tests, and some replay callbacks still open read transactions.
