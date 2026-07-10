import type { WorkSourceType, WorkStage, WorkTaskStatus } from "@prisma/client";

export type UniversalWorkScanInput = { code: string; currentUserId: string; selectedAccountId?: string };
export type UniversalWorkScanCandidate = {
  sourceType: WorkSourceType;
  sourceId: string;
  taskId: string;
  stage: WorkStage;
  status: WorkTaskStatus;
  accountId: string;
  accountName: string;
  marketplace: string;
  productTitle: string | null;
  imageUrl: string | null;
  primaryIdentifier: string;
  requiredQuantity: number;
  completedQuantity: number;
  nextAction: string;
};

export function prepareUniversalScanCode(value: unknown) {
  const code = String(value ?? "").normalize("NFKC").trim();
  return code && code.length <= 160 && !/[\u0000-\u001f\u007f]/.test(code) ? code.toUpperCase() : null;
}

export function actionableScanCandidate(candidate: Pick<UniversalWorkScanCandidate, "status">) {
  return candidate.status === "READY" || candidate.status === "IN_PROGRESS" || candidate.status === "PROBLEM";
}
