import type { WorkStage } from "@prisma/client";
import { getCurrentUser, getSelectedAccount } from "@/lib/auth";
import { getGroupedWork, getGroupedWorkDetails, type GroupedWorkSource } from "@/src/lib/workflow/grouped-work";

const STAGES = new Set(["PICK", "MARK", "ASSEMBLE", "PACK"]);
const SOURCES = new Set(["ORDER", "CONSIGNMENT"]);

export async function GET(request: Request, { params }: { params: Promise<{ stage: string; groupKey: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const account = await getSelectedAccount(user);
  if (!account) return Response.json({ error: "Select an active seller account." }, { status: 409 });

  const route = await params;
  const url = new URL(request.url);
  const stage = route.stage.toUpperCase() as WorkStage;
  const sourceType = url.searchParams.get("source") as GroupedWorkSource;
  if (!STAGES.has(stage) || !SOURCES.has(sourceType)) return Response.json({ error: "Invalid work filter." }, { status: 400 });

  if (url.searchParams.get("quick") === "1") {
    try {
      const details = await getGroupedWorkDetails({ actorUserId: user.id, accountId: account.id, stage, sourceType, groupKey: route.groupKey, pageSize:25, historyPageSize:5 });
      const first = details.tasks[0];
      const instructions = first?.instructions ?? {};
      const problemEvents = new Map(details.history.filter((item) => item.action === "TASK_PROBLEM_REPORTED").map((item) => [item.taskId, { reporter: item.actorUser.name, reportedAt: item.createdAt.toISOString() }]));
      const instructionLines = [instructions.instructions, instructions.assemblyTitle, instructions.assemblyInstructions, instructions.workerNote].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
      return Response.json({
        card: details.card,
        quick: {
          groupVersion: details.card.groupVersion,
          tasks: details.tasks.map((task) => ({
            taskId: task.id,
            orderId: task.orderId,
            version: task.version,
            status: task.status,
            requiredQuantity: task.requiredQuantity,
            completedQuantity: task.completedQuantity,
            assignment: task.assignedUser?.name ?? "Unassigned",
            reference: task.order?.orderItemId ?? task.order?.orderNo ?? task.consignmentLine?.externalIdSnapshot ?? task.id.slice(-8),
            productTitle: typeof task.workCardSnapshot.productTitle === "string" ? task.workCardSnapshot.productTitle : task.order?.productDescription ?? null,
            sellerSku: typeof task.workCardSnapshot.sellerSku === "string" ? task.workCardSnapshot.sellerSku : task.order?.sku ?? task.consignmentLine?.sellerSkuSnapshot ?? null,
            imageUrl: typeof task.workCardSnapshot.primaryImage === "string" ? task.workCardSnapshot.primaryImage : null,
            problemReason: task.problemReason,
            problemReporter: problemEvents.get(task.id)?.reporter ?? null,
            problemReportedAt: task.problemReportedAt?.toISOString() ?? problemEvents.get(task.id)?.reportedAt ?? null,
          })),
          history: details.history.map((item) => ({ id: item.id, action: item.action, actor: item.actorUser.name, createdAt: item.createdAt.toISOString(), quantityAfter: item.quantityAfter })),
          instructions: instructionLines,
        },
      });
    } catch {
      return Response.json({ error: "Work group is no longer available." }, { status: 404 });
    }
  }

  const result = await getGroupedWork({ actorUserId: user.id, accountId: account.id, stage, sourceType, targetGroupKey: route.groupKey, includeMemberIds: true });
  return result.cards[0] ? Response.json({ card: result.cards[0] }) : Response.json({ error: "Work group is no longer available." }, { status: 404 });
}
