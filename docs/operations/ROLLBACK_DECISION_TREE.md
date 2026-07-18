# Rollback decision tree

## Before deployment or migration

```text
Verified backup generation exists?
├─ No  → STOP. Do not deploy or migrate.
└─ Yes
   └─ Restore rehearsal passed on the same generation and application commit?
      ├─ No  → STOP. Investigate or create and rehearse a new generation.
      └─ Yes → Continue only under the separately approved release runbook.
```

## During backup

```text
Source changed, writer detected, copy interrupted, or verification failed?
├─ Yes → Keep application stopped if source consistency is uncertain.
│        Discard only the incomplete temporary generation.
│        Never modify the source or overwrite an older verified generation.
│        Resolve the cause and restart the complete backup window.
└─ No  → Seal and independently verify the generation.
```

## During migration or rollout

```text
Failure before any production mutation?
├─ Yes → Abort rollout. Leave the source untouched. No restore is needed.
└─ No
   └─ Production mutation may have committed?
      ├─ Unknown → Stop all writers; preserve logs and current files; escalate.
      └─ Yes
         └─ Can the forward repair be proven safer and completed inside the approved window?
            ├─ Yes → Use only an independently reviewed forward-repair plan.
            └─ No  → Keep writers stopped and invoke the approved restore procedure.
```

## Restore decision

Never restore over a live or partially mutated directory. Restore the verified generation to a separate target, reverify it, and then perform an explicit controlled path switch. Preserve the failed state for investigation unless legal/privacy policy requires otherwise.

Rollback is blocked when:

- backup hash or manifest verification fails;
- backup application commit is unknown or incompatible;
- required private storage is missing;
- migration history is unexpected;
- SQLite integrity or foreign keys fail;
- the restore target is not empty/separate;
- the database and storage were captured from different unquiesced windows;
- operator approval or secret recovery is unavailable.

## Post-restore gate

Before reopening traffic, verify application startup against the restored copy, selected high-value counts and records, permissions, active imports/jobs, private files, and disabled outbound integrations. Reopening production requires separate approval. Stage 1 does not perform or authorize this step.
