# Marking Workflow

`/work/marking` is available to active users with `canMark` in the selected account. Cards show the immutable listing snapshot, marking settings, current work quantity, preview, and file availability.

Preview and file requests go through `/work/tasks/[taskId]/marking-file`. The server rechecks authentication, account assignment, MARK permission, task assignment, active asset, listing link, and active file. Files are streamed with private no-store caching and `nosniff`; managed paths are never returned. Downloads and previews are recorded in `WorkActionLog`.

The owner copy remains private. An authenticated Windows Worker Agent and automatic temporary-file cleanup remain later work.
