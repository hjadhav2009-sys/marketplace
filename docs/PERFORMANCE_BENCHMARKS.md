# Performance Benchmarks

Results are machine-specific observations, not guaranteed production latency.

## Universal Resolver

Small preset database: 2 accounts, 5,000 listings/identifiers, 1,000 tasks, 500 orders, 6,381,568-byte SQLite file.

- Warm p50 across scenarios: about 66-152 ms in the final full-suite run.
- Warm p95 across scenarios: about 81-389 ms.
- Warm maximum observed: 389.17 ms.
- Cold observed range: about 57-186 ms.
- Assigned-task case remained present; candidate limit remained enforced.
- Heap observation: about 16.1 MB before and 33.5 MB after the final measured run.

Run larger local presets without committing databases:

```powershell
npm.cmd run phase7:generate-scale -- medium
npx.cmd tsx scripts/full-universal-resolver-benchmark.ts medium
```

The 800,000-listing preset is available but was not run in this pass because this owner PC is a 2-core/4-thread i3 and the full generation is intentionally expensive.

## Import Parsing

- Flipkart fake listing rows: 30,000 parsed in 6,934 ms; planning 357 ms; 256 MB RSS.
- Flipkart fake order rows: 1,000 parsed in 132 ms; planning 79 ms.
- Amazon fake shipment rows: 10,000 parsed in approximately 8.4-12.1 seconds across focused and full-suite runs.

These parser measurements exclude database matching, browser transport, and activation. Preview remains non-activating; activation remains explicit and transactional.
