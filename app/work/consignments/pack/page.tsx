import { redirect } from "next/navigation";
import { WorkerQueuePage } from "../../WorkerQueuePage";

type LegacyPackQuery = { page?: string; q?: string; status?: string; success?: string; error?: string };

export default async function Page({ searchParams }: { searchParams: Promise<LegacyPackQuery> }) {
  const query = await searchParams;
  const needsLegacyQueue = Boolean(query.q?.trim()) || Boolean(query.status && query.status !== "active");

  if (needsLegacyQueue) {
    return <WorkerQueuePage stage="PACK" title="Consignment Packing" description="Search or review historical Consignment Pack work. Active queue work now uses the Pack workspace." searchParams={Promise.resolve(query)} />;
  }

  const destination = new URLSearchParams({ source: "CONSIGNMENT" });
  if (query.page) destination.set("page", query.page);
  if (query.success) destination.set("success", query.success);
  if (query.error) destination.set("error", query.error);
  redirect(`/work/pack?${destination.toString()}`);
}
