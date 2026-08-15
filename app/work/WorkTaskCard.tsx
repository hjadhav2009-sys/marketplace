import type { User } from "@prisma/client";
import type { WorkerQueueTask } from "@/src/lib/workflow/queues";
import { WorkTaskCardView } from "./WorkTaskCardView";

export function WorkTaskCard({ task, returnPath, user }: { task: WorkerQueueTask; returnPath: string; user: User }) {
  return <WorkTaskCardView task={task} returnPath={returnPath} user={user} />;
}
