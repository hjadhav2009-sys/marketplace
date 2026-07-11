import Link from "next/link";
import { universalCandidateAction } from "@/app/work/scan/actions";
import { getAuthorizedWorkAccounts, resolveUniversalWork, type UniversalScanIntent, type UniversalWorkCandidate } from "@/src/lib/workflow/universal-resolver";
import { ProductImage } from "./ProductImage";
import { SubmitButton } from "./SubmitButton";

export async function UniversalScannerPanel({ actorUserId, query, intent = "ANY", accountId, success, error, actionPath = "/work/scan" }: { actorUserId: string; query?: string; intent?: UniversalScanIntent; accountId?: string; success?: string; error?: string; actionPath?: string }) {
  const scope = await getAuthorizedWorkAccounts(actorUserId);
  let result: Awaited<ReturnType<typeof resolveUniversalWork>> | null = null;
  let lookupError: string | null = null;
  if (query) try { result = await resolveUniversalWork({ actorUserId, code: query, intent, accountId }); } catch (cause) { lookupError = cause instanceof Error ? cause.message : "Search failed."; }
  return <section className="space-y-4" data-universal-scanner>
    <form action={actionPath} className="rounded-md border bg-white p-4 shadow-sm">
      <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]"><input name="q" defaultValue={query} autoFocus enterKeyHint="search" placeholder="Scan AWB, Tracking ID, SKU, FSN, listing ID or barcode" className="min-h-14 rounded-md border px-4 text-lg font-bold"/><select name="intent" defaultValue={intent} className="min-h-14 rounded-md border px-3 font-bold">{["ANY","PICK","MARK","PACK"].map((item)=><option key={item} value={item}>{item === "ANY" ? "All work" : item}</option>)}</select><button className="min-h-14 rounded-md bg-berry px-6 font-black text-white">Find work</button></div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><label className="text-xs font-bold text-slate-500">Account</label><select name="accountId" defaultValue={accountId ?? ""} className="min-h-11 rounded-md border px-3 text-sm font-bold"><option value="">All authorized accounts</option>{scope.accounts.map((account)=><option key={account.id} value={account.id}>{account.marketplace} / {account.accountDisplayName ?? account.name}</option>)}</select><span className="text-xs text-slate-500">Lookup only. Scanning never changes work.</span></div>
    </form>
    {success ? <div className="rounded-md border border-teal-200 bg-teal-50 p-3 font-bold text-teal-800">{success}</div> : null}
    {error || lookupError ? <div className="rounded-md border border-rose-200 bg-rose-50 p-3 font-bold text-rose-700">{error ?? lookupError}</div> : null}
    {result ? <><div className="flex flex-wrap justify-between gap-2 text-sm font-bold text-slate-600"><span>{result.candidates.length} active result(s) across {result.searchedAccountCount} account(s)</span><span>{result.durationMs} ms</span></div>{result.candidates.length ? <div className="grid gap-3">{result.candidates.map((candidate)=><UniversalCandidateCard key={candidate.candidateKey} candidate={candidate} code={result.normalizedInput} intent={intent} accountFilter={accountId} returnPath={actionPath}/>)}</div> : <div className="rounded-md border border-dashed bg-white p-6 text-center"><p className="font-black">{result.completedMatchCount ? "No active work found. Matching work is already completed." : "No exact active work found."}</p><p className="mt-1 text-sm text-slate-600">No action was performed.</p></div>}</> : null}
    <div className="flex gap-2"><Link href="/packing" className="rounded-md border px-4 py-2 text-sm font-bold">Customer Order Packing</Link><Link href="/work" className="rounded-md border px-4 py-2 text-sm font-bold">Work Hub</Link></div>
  </section>;
}

type CandidateAction = { value: "ORDER_PICK" | "ORDER_PACK" | "TASK_CLAIM" | "TASK_INCREMENT" | "TASK_COMPLETE"; label: string };
function UniversalCandidateCard({ candidate, code, intent, accountFilter, returnPath }: { candidate: UniversalWorkCandidate; code: string; intent: UniversalScanIntent; accountFilter?: string; returnPath: string }) {
  const actions: CandidateAction[] = [];
  if (candidate.canAct) {
    if (candidate.actionType === "ORDER_PICK") actions.push({ value: "ORDER_PICK", label: "Pick order" });
    else if (candidate.actionType === "ORDER_PACK") actions.push({ value: "ORDER_PACK", label: "Pack order" });
    else { if (candidate.status === "READY" && !candidate.assignedUserId) actions.push({ value: "TASK_CLAIM", label: "Start" }); actions.push({ value: "TASK_INCREMENT", label: "+1" }, { value: "TASK_COMPLETE", label: "Complete remaining" }); }
  }
  const token = `scan:${candidate.candidateKey}:${candidate.status}:${candidate.completedQuantity}`;
  return <article className="grid gap-3 rounded-md border bg-white p-4 shadow-sm sm:grid-cols-[6rem_1fr_auto]">
    <ProductImage src={candidate.productImageUrl} alt={candidate.productTitle ?? candidate.sellerSku ?? "Work product"} size="md" showBadge={false}/>
    <div><div className="flex flex-wrap gap-1"><span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-white">{candidate.marketplace}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{candidate.accountName}</span><span className="rounded-full bg-pink-50 px-2 py-1 text-xs font-bold text-berry">{candidate.actionType.replaceAll("_", " ")}</span></div><p className="mt-2 text-xl font-black">{candidate.sellerSku ?? "No SKU"}</p><p className="line-clamp-2 text-sm text-slate-600">{candidate.productTitle ?? "Untitled work"}</p><p className="mt-1 text-xs text-slate-500">Matched {candidate.matchType.replaceAll("_", " ")} {candidate.matchedIdentifierMasked}</p><div className="mt-2 flex gap-3 text-sm font-bold"><span>Required {candidate.requiredQuantity}</span><span>Done {candidate.completedQuantity}</span><span>Remaining {candidate.remainingQuantity}</span></div>{candidate.stage === "MARK" ? <p className="mt-1 text-xs font-bold text-slate-600">Marking file {candidate.markingFileAvailable ? "available" : "not available"}</p> : null}{candidate.assignedUserName ? <p className="mt-1 text-xs text-slate-500">Assigned to {candidate.assignedUserName}</p> : null}{candidate.readOnlyReason ? <p className="mt-2 text-sm font-bold text-amber-700">{candidate.readOnlyReason}</p> : null}</div>
    <div className="grid content-center gap-2">{actions.map((action)=><form key={action.value} action={universalCandidateAction}><input type="hidden" name="returnPath" value={returnPath}/><input type="hidden" name="code" value={code}/><input type="hidden" name="intent" value={intent}/><input type="hidden" name="accountFilter" value={accountFilter ?? ""}/><input type="hidden" name="accountId" value={candidate.accountId}/><input type="hidden" name="sourceId" value={candidate.sourceId}/><input type="hidden" name="action" value={action.value}/><input type="hidden" name="expectedQuantity" value={candidate.completedQuantity}/><input type="hidden" name="expectedStatus" value={candidate.status}/><input type="hidden" name="clientRequestId" value={`${token}:${action.value}`}/><SubmitButton pendingText="Saving..." variant={action.value.endsWith("INCREMENT") ? "secondary" : "primary"}>{action.label}</SubmitButton></form>)}</div>
  </article>;
}
