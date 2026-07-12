# Production Readiness

Release requires all automated validation, a production build with exit code 0 and `.next/BUILD_ID`, a startup preflight, login response, one authenticated fake workflow, and clean shutdown.

On Windows, the readiness launcher executes npm/Prisma command shims through `cmd.exe`; direct `spawnSync("npx.cmd")` is not portable. If an existing private SQLite database reports pending migrations, review and apply them deliberately. QA startup should use a fresh ignored database rather than silently changing warehouse data.

Before rollout:

- configure private secrets outside Git;
- run migrations and backups;
- keep SQLite on the owner PC or use the aligned PostgreSQL schema;
- restrict access to LAN/Tailscale/Cloudflare policy;
- verify ignored storage and cleanup retention;
- run browser and warehouse checklists;
- validate role/account assignments;
- test restore from backup;
- keep real reports, databases, marking files, and images out of Git.

Native Phase 8 begins only after this website/backend checkpoint is manually approved. No WebView is planned. Expo development and device testing precede the final signed APK.
