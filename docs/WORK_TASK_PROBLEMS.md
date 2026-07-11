# Work Task Problems

Workers report a category and optional note from a task card. The task keeps its completed quantity and assignment, changes to PROBLEM, blocks progress, and leaves later stages locked. The batch becomes PROBLEM while any task remains problematic.

Owners and consignment managers use `/work/problems` to resolve or reassign work. Resolution requires a note, preserves the original reason and action history, and returns zero-progress tasks to READY or partial tasks to IN_PROGRESS. After the final problem is resolved, reconciliation restores the batch to ACTIVE unless all final PACK work is complete.

Problems are operational history and are never deleted by resolution.
