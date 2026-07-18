# Bugs, fixes, and review findings

- Universal scanning and workflow initially required shipment-wide safety corrections; Phase 4.1 fixed those paths.
- Customer-order packing was aligned with the shared shipment-safety rule in Phase 4.2.
- Amazon parsing and snapshot scanning received two Phase 6 correction commits.
- Unsupported consignment assembly activation was blocked in Phase 7.2A.
- Phase 7 review approved automated/code work but clarified that the benchmark result is small-only, query plans are representative, and high concurrency is quantity-increment-specific.
- Nonblocking backend cleanup remains for older claim/problem/reassignment replay callbacks or narrower documentation.
- The reset checkpoint is reconstructed directly on the approved `2981db0` base so later-branch implementation evidence is excluded.
- The first synthetic reset fixture referenced the wrong implicit join-table name; migration evidence showed `_UserAssignedAccounts`, and the fixture was corrected before reset-engine validation.
