# Phase 7.3.6 Stage 5 two-worker QA plan

## Isolation

Use two isolated browser profiles or two privately connected computers and only the Stage 3 synthetic accounts. A later authorization is required before private LAN or Tailscale access. Never expose staging publicly.

## Actors

Use the private credential index for Synthetic Picker A/B, Marker, Assembler, Packer A/B, View-All Worker, Import Manager and Owner. Do not copy passwords into reports.

## Contention matrix

- simultaneous claim and completion;
- duplicate click and network retry;
- same request ID with changed payload;
- assignment change while another card is open;
- permission or account access removal while a card is open;
- concurrent missing-listing save and resolution;
- scanner result/action contention and live refresh;
- two packers completing one package or Consignment line.

Run all four routes for Customer Orders and Consignments: Pick to Pack; Pick to Mark to Pack; Pick to Assembly to Pack; and Pick to Mark to Assembly to Pack. Include problems at every stage, resolution without stage rewind, package siblings and final batch reconciliation.

Expected result is one mutation, one durable receipt/history result, no duplicate listing/task, a controlled stale message, correct live update and no raw database error. All scenarios remain pending after Stage 3.
