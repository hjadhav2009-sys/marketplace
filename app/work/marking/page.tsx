import { redirect } from "next/navigation";
import { WorkerQueuePage } from "../WorkerQueuePage";

type MarkingSearchParams = Promise<{ page?: string; q?: string; status?: string; success?: string; error?: string }>;

export default async function Page({ searchParams }: { searchParams: MarkingSearchParams }) {
  const query = await searchParams;
  const status = query.status === "completed" ? "completed" : query.status === "problem" ? "problem" : "active";
  if (!query.q?.trim() && status === "active") {
    const destination = new URLSearchParams({ source: "CONSIGNMENT" });
    if (query.success) destination.set("success", query.success);
    if (query.error) destination.set("error", query.error);
    redirect(`/work/mark?${destination.toString()}`);
  }
  return <WorkerQueuePage stage="MARK" title="Marking search and history" description="Find an exact Consignment task or review Problem and Completed history." searchParams={Promise.resolve(query)} />;
}
