# Universal Scanner Performance

Run:

```powershell
npm.cmd run universal-scan:benchmark
```

The benchmark creates an ignored temporary SQLite database with 20 accounts, 800,000 listing identifiers, 2,000 synthetic orders, and 3,000 synthetic tasks. It measures the indexed identifier lookup core, not browser rendering or full end-to-end resolver latency.

Measured on the development PC during Phase 4:

| Scenario | Cold | Warm average (100 runs) |
| --- | ---: | ---: |
| 100,000-row target | 0.196 ms | 0.158 ms |
| 800,000-row target | 0.150 ms | 0.057 ms |
| No result | 0.059 ms | 0.062 ms |

SQLite reported a covering search using `Identifier_type_value_account_idx` for `identifierType`, `normalizedValue`, and `accountId`. Results vary by hardware and cache state. The real temporary-database integration test separately exercises the complete resolver, account authorization, orders, identifiers, and tasks.

Production safeguards are exact matching, bounded candidate loads, no title scan, no full listing fetch, compact selects, and code-first indexes in both SQLite and PostgreSQL schemas.
