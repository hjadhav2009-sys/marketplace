# Phase 7.3.6 Stage 3 staging boundary

## Release separation

- Reviewed RC1 application branch remains `phase-7.3.6-projection-idempotent-import-manual-catalog` at `f4b36c1a6e3df7d272b2d87999cc12478b196314`.
- Pull request #1 is not changed by Stage 3.
- Stage 1, Stage 2 and Stage 3 are local operational branches and are not part of pull request #1.
- Remote `origin/main` remains `2981db0187c02e9c02174d1f12d0a5c4509359de`. A pre-existing local-only `main` ref is separate and was neither checked out nor changed by Stage 3.
- Stage 3 is local only: no push, merge, deployment, public tunnel or production-domain change is authorized.

## Four distinct data classes

1. RC1 source is reviewed application code. Stage 3 does not rewrite its history.
2. Operational tooling creates and controls a loopback-only staging runtime.
3. Synthetic staging data, credentials, fixtures, sessions, logs and reports live only below the ignored private staging root.
4. Production database, production storage, marketplace files and customer data are outside Stage 3 scope and must not be read, copied, migrated or modified.

The retained previous-executable artifact contains source/build output and metadata only. It contains no database, storage, credential, session, cookie or private fixture. It does not replace the requirement for an encrypted matching production-data backup at deployment time.
