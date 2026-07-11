UPDATE "WorkActionLog" SET "requestKind" = CASE
  WHEN "action"='TASK_CLAIMED' THEN 'CLAIM'::"WorkRequestKind"
  WHEN "action"='TASK_INCREMENTED' THEN 'INCREMENT'::"WorkRequestKind"
  WHEN "action"='TASK_PROGRESS_SET' THEN 'SET_PROGRESS'::"WorkRequestKind"
  WHEN "action"='TASK_COMPLETED' THEN 'COMPLETE'::"WorkRequestKind"
  WHEN "action"='TASK_PROBLEM_REPORTED' THEN 'REPORT_PROBLEM'::"WorkRequestKind"
  WHEN "action"='TASK_PROBLEM_RESOLVED' THEN 'RESOLVE_PROBLEM'::"WorkRequestKind"
  WHEN "action"='TASK_REASSIGNED' THEN 'REASSIGN'::"WorkRequestKind"
  WHEN "action"='TASK_UNASSIGNED' THEN 'UNASSIGN'::"WorkRequestKind"
  ELSE NULL END
WHERE "clientRequestId" IS NOT NULL;

DROP INDEX "WorkActionLog_task_request_key";
CREATE UNIQUE INDEX "WorkActionLog_task_actor_kind_request_key" ON "WorkActionLog"("taskId","actorUserId","requestKind","clientRequestId");
CREATE INDEX "WorkActionLog_task_request_idx" ON "WorkActionLog"("taskId","clientRequestId");
CREATE INDEX "WorkTask_account_stage_status_completed_idx" ON "WorkTask"("accountId","stage","status","completedAt");
