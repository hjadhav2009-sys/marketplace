# Phase 7.3.6 Stage 4.6C — Checkpoint A

## Result

```text
STAGE4_6C_A_ATLAS_ENGINE_READY
```

Checkpoint A changes QA tooling only. No application runtime, UI, backend,
schema, middleware, runtime dependency, Next.js configuration, or mobile
application file changed.

The previous failed-atlas evidence remains private and preserved under its
original ignored evidence root.

## Branch boundary

```text
Base tag:
phase-7.3.6-stage4.6a-frozen-rc

Base SHA:
7462fabeae9876907b0d5b26aee3117b3cd8d819

Recovery branch:
phase-7.3.6-stage4.6c-atlas-recovery
```

The old frozen tag was not moved, amended, or deleted.

## Deterministic shard plan

The atlas is no longer one 846-entry process.

```text
Semantic scenarios: 141
Viewports:           6
Scenario batches:    7 per viewport
Total shards:        42
Entries per shard:   20 or 21
Maximum shard time:  30 minutes
Planned entries:     846
```

Each shard has its own:

- immutable plan manifest;
- journaled progress checkpoint;
- capture and server logs;
- bounded timeout;
- independently verifiable result;
- resume state.

Hash-verified completed entries are skipped unless `--force` is supplied.
Failed entries remain independently retryable.

The plan imports the existing frozen evidence without deleting or silently
upgrading it:

```text
Prior captured and hash-valid:     199
Prior semantic-verified adopted:    10
Retained for semantic recapture:   189
Still uncaptured:                  647
```

The 10 entries already accepted by the frozen semantic manifest are seeded as
verified. The other 189 PNGs remain referenced with their hashes and are
explicitly labelled `CAPTURED_NEEDS_EXPLICIT_SEMANTIC_RECAPTURE`; they are not
misrepresented as verified under the stronger contracts.

Commands:

```text
npm.cmd run atlas:plan
npm.cmd run atlas:run-shard -- --shard 360x800-batch-01
npm.cmd run atlas:resume
npm.cmd run atlas:verify-shard -- --shard 360x800-batch-01
npm.cmd run atlas:aggregate
```

`atlas:run-shard` owns its synthetic Next.js server and stops it in `finally`.
It refuses an occupied staging port and verifies exact source SHA and BUILD_ID
before capture.

## Windows-safe checkpoints

The checkpoint writer now:

1. writes a uniquely named temporary file in the destination directory;
2. closes and synchronizes the file handle;
3. retries `EPERM`, `EBUSY`, and `EACCES` using bounded exponential backoff;
4. commits an immutable, hash-addressed version;
5. records `PREPARE`, `COMMITTED`, and materialization journal entries;
6. attempts safe destination replacement;
7. verifies the destination hash;
8. recovers from the last committed immutable version when the materialized
   destination is missing or corrupt;
9. removes only proven stale temporary files.

An interruption after immutable commit does not lose the checkpoint.

## Semantic registry

Preflight result:

```text
Explicit semantic contracts: 141/141
Fixture mappings:            141/141
Planned entries:             846/846
```

Every contract records:

- required visible assertions;
- forbidden visible assertions;
- required action states;
- forbidden enabled actions;
- role;
- selected account;
- route and expected URL;
- fixture identity;
- one or more concrete fixture probes.

Preflight opens only the private synthetic staging database in read-only mode.
It verifies the required synthetic users and selected accounts, then checks
each mapped listing, import, issue, consignment, task, problem, scan, deletion
job, or upload record by its deterministic identifier. Upload-only states
verify their private synthetic fixture files. Dynamic route examples are
mapped to and checked against their underlying synthetic database record.
Missing records, missing files, inactive role users, or unavailable accounts
stop planning before Chrome or the staging server starts.

There is no generic semantic fallback. A missing contract, wrong role/account,
wrong route, missing required text/action, or forbidden visible/action state
prevents verification.

The capture runner now also rejects:

- console errors;
- page errors;
- unexpected request/response failures;
- horizontal overflow;
- enabled interactive targets below 44 CSS pixels;
- failed semantic contracts;
- mixed SHA, BUILD_ID, scenario-version, or runner-version evidence.

## Test coverage

Checkpoint A tests cover:

- resume after interruption;
- skip of a completed hash-verified entry;
- retry of only failed work;
- adoption of prior hash-valid evidence without upgrading blocked semantics;
- simulated `EPERM`, `EBUSY`, and indexer-style locks;
- existing destination replacement;
- immutable-version recovery after process interruption;
- corrupt materialized checkpoint recovery;
- evidence hash corruption detection;
- missing synthetic database-record rejection;
- missing semantic-contract rejection;
- wrong-state rejection;
- orphan screenshot exclusion;
- duplicate-hash traceability;
- exact 846-entry aggregation;
- runtime cleanup through `finally`.

## Remaining boundary

No Checkpoint B runtime repair was started.

Checkpoint B must independently reproduce and then repair only:

- the expired-session browser 404;
- shared enabled operational controls below the 44 × 44 CSS pixel target.

Those runtime changes require a separate commit, new frozen SHA, new tag, and
new BUILD_ID before Checkpoint C capture.
