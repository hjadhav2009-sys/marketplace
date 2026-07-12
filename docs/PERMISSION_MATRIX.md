# Permission Matrix

| Capability | Owner | Explicit worker permission | Legacy role fallback | View-all |
| --- | --- | --- | --- | --- |
| Pick | Yes | `canPick` | PICKER | Read only unless `canPick` |
| Mark | Yes | `canMark` | None | Read only |
| Assemble | Yes | `canAssemble` | None | Read only |
| Pack | Yes | `canPack` | PACKER | Read only unless `canPack` |
| Report problem | Yes | `canReportProblem` plus stage/account rules | Current workflow rules | Own/visible only |
| View consignments | Yes | `canViewConsignments` | None | Does not imply management |
| Import consignments | Yes | `canImportConsignments` | None | No |
| Activate/manage | Yes | `canManageConsignments` | None | No |
| Marking library | Yes | `canManageMarkingLibrary` | None | No |
| Process rules | Yes | `canManageProcessRules` | None | No |

Every mutation rechecks active user, active/assigned account, stage permission, source identity, expected state, and request replay. Client account IDs are selectors, never authorization proof. Removing account access invalidates subsequent actions.
