import Link from "next/link";
import { universalCandidateAction } from "@/app/work/scan/actions";
import { getAuthorizedWorkAccounts, resolveUniversalWork, type UniversalScanIntent, type UniversalSourceFilter, type UniversalWorkCandidate } from "@/src/lib/workflow/universal-resolver";
import { ProductImage } from "./ProductImage";
import { SubmitButton } from "./SubmitButton";
import { UniversalScanInput } from "./UniversalScanInput";
import { ScannerPickRouteDialog } from "./ScannerPickRouteDialog";

export async function UniversalScannerPanel({ actorUserId, selectedAccountId, query, intent = "ANY", sourceFilter="ALL", success, error, actionPath = "/work/scan" }: { actorUserId: string; selectedAccountId: string; query?: string; intent?: UniversalScanIntent; sourceFilter?: UniversalSourceFilter; success?: string; error?: string; actionPath?: string }) {
  const scope = await getAuthorizedWorkAccounts(actorUserId);
  const selectedAccount=scope.accounts.find(account=>account.id===selectedAccountId);if(!selectedAccount)throw new Error("The selected account is no longer assigned to this user.");
  let result: Awaited<ReturnType<typeof resolveUniversalWork>> | null = null;
  let lookupError: string | null = null;
  if (query) try { result = await resolveUniversalWork({ actorUserId, code: query, intent, sourceFilter, accountId:selectedAccountId }); } catch (cause) { lookupError = cause instanceof Error ? cause.message : "Search failed."; }
  const visibleCompletedResults = result?.candidates.filter((candidate) => candidate.status === "PACKED" || candidate.status === "COMPLETED").length ?? 0;
  const visibleActiveResults = (result?.candidates.length ?? 0) - visibleCompletedResults;
  const completedResultCount = result ? Math.max(visibleCompletedResults, result.completedMatchCount) : 0;
  return <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]" data-universal-scanner><div className="space-y-4 lg:sticky lg:top-24 lg:self-start" data-scanner-controls>
    <form id="universal-scan-form" action={actionPath} className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="grid gap-2"><UniversalScanInput initialValue={query} selectOnMount={Boolean(error || lookupError)}/><select name="intent" defaultValue={intent} className="min-h-14 rounded-xl border px-3 font-bold">{["ANY","PICK","MARK","ASSEMBLE","PACK"].map((item)=><option key={item} value={item}>{item === "ANY" ? "All work" : item}</option>)}</select><select name="source" defaultValue={sourceFilter} className="min-h-14 rounded-xl border px-3 font-bold"><option value="ALL">All sources</option><option value="CUSTOMER_ORDERS">Customer Orders</option><option value="CONSIGNMENTS">Consignments</option></select><button className="min-h-14 rounded-xl bg-berry px-6 font-black text-white">Find work</button></div>
      <input type="hidden" name="accountId" value={selectedAccountId}/><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold">{selectedAccount.marketplace} / {selectedAccount.accountDisplayName??selectedAccount.name}</span><span className="text-xs text-slate-500">Selected-account lookup only. Scanning never changes work.</span></div>
    </form><div className="flex flex-wrap gap-2"><Link href="/packing" className="min-h-11 rounded-xl border px-4 py-2 text-sm font-bold">Customer Order Packing</Link><Link href="/work" className="min-h-11 rounded-xl border px-4 py-2 text-sm font-bold">Work Hub</Link></div></div><div className="min-w-0 space-y-4" data-scanner-results>
    {success ? <div className="rounded-md border border-teal-200 bg-teal-50 p-3 font-bold text-teal-800">{success}</div> : null}
    {error || lookupError ? <div className="rounded-md border border-rose-200 bg-rose-50 p-3 font-bold text-rose-700">{error ?? lookupError}</div> : null}
    {result ? <><div className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600"><span>{visibleActiveResults} active result(s){completedResultCount ? ` · ${completedResultCount} completed read-only result(s)` : ""} in the selected account</span><span>Lookup completed in {result.durationMs} ms</span></div>{result.candidates.length ? <div className="grid gap-3">{result.candidates.map((candidate)=><UniversalCandidateCard key={candidate.candidateKey} candidate={candidate} code={result.normalizedInput} intent={intent} sourceFilter={sourceFilter} accountFilter={selectedAccountId} returnPath={actionPath}/>)}</div> : <div className="rounded-md border border-dashed bg-white p-6 text-center"><p className="font-black">{result.completedMatchCount ? "No active work found. Matching work is already completed." : "No exact active work found."}</p><p className="mt-1 text-sm text-slate-600">No action was performed.</p></div>}</> : null}
    </div></section>;
}

function WorkflowStateGrid({workflow}:{workflow:NonNullable<UniversalWorkCandidate["workflowPrerequisites"]>}){return <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">{(["PICK","MARK","ASSEMBLE","PACK"] as const).map(stage=>{const item=workflow.stages[stage],ok=item.state==="SATISFIED"||item.state==="NOT_REQUIRED";return <div key={stage} className={`rounded-md border px-2 py-2 text-xs font-black ${ok?"border-teal-200 bg-teal-50 text-teal-900":"border-amber-200 bg-amber-50 text-amber-950"}`}><p>{stage[0]}{stage.slice(1).toLowerCase()}</p><p className="mt-1 font-medium">{item.state.replaceAll("_"," ").toLowerCase()}</p></div>})}</div>}

type CandidateAction = { value: "ORDER_MARK_COMPLETE" | "ORDER_PACK" | "ASSEMBLY_SEND" | "ASSEMBLY_CLAIM" | "ASSEMBLY_COMPLETE" | "ASSEMBLY_PROBLEM" | "TASK_CLAIM" | "TASK_COMPLETE"; label: string };
function UniversalCandidateCard({ candidate, code, intent, sourceFilter, accountFilter, returnPath }: { candidate: UniversalWorkCandidate; code: string; intent: UniversalScanIntent; sourceFilter: UniversalSourceFilter; accountFilter?: string; returnPath: string }) {
  const actions: CandidateAction[] = [];
  if (candidate.canAct) {
    if (candidate.actionType === "ORDER_PACK") actions.push({ value: "ORDER_PACK", label: "Pack Completed" });
    else if (candidate.actionType === "ORDER_MARK") actions.push({ value: "ORDER_MARK_COMPLETE", label: "Complete marking" });
    else if (candidate.actionType === "ORDER_SEND_TO_ASSEMBLY") { /* Explicit form rendered below. */ }
    else if (candidate.actionType === "ORDER_ASSEMBLY") { if (candidate.status === "READY" && !candidate.assignedUserId) actions.push({ value: "ASSEMBLY_CLAIM", label: "Start" }); actions.push({ value: "ASSEMBLY_COMPLETE", label: "Assembly Completed" }, { value: "ASSEMBLY_PROBLEM", label: "Report Problem" }); }
    else { if (candidate.status === "READY" && !candidate.assignedUserId) actions.push({ value: "TASK_CLAIM", label: "Start" }); if(candidate.stage!=="PICK"&&candidate.status!=="COMPLETED") actions.push({ value: "TASK_COMPLETE", label: candidate.stage==="ASSEMBLE"?"Assembly Completed":candidate.stage==="PACK"?"Pack Completed":"Complete stage" }); }
  }
  const token = `scan:${candidate.candidateKey}:${candidate.status}:${candidate.completedQuantity}`;
  return <article className="grid min-w-0 gap-4 overflow-hidden rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-[6rem_minmax(0,1fr)] xl:grid-cols-[6rem_minmax(0,1fr)_minmax(13.75rem,17.5rem)_minmax(11.25rem,13.75rem)]" data-scanner-candidate data-action-scope={candidate.actionType}>
    <ProductImage src={candidate.productImageUrl} alt={candidate.productTitle ?? candidate.sellerSku ?? "Work product"} size="scanner" showBadge={false}/>
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1"><span className="rounded-full bg-slate-950 px-2 py-1 text-xs font-black text-white">{candidate.sourceLabel}</span><span className="rounded-full bg-pink-50 px-2 py-1 text-xs font-bold text-berry">{candidate.marketplace}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{candidate.accountName}</span></div>
      <p className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-950">{candidateScopeLabel(candidate)}</p>
      <p className="mt-2 break-all text-sm font-black text-slate-950">{candidate.displayReference}</p>
      <p className="mt-1 break-words text-xl font-black">{candidate.sellerSku ?? "No SKU"}</p>
      <p className="line-clamp-2 text-sm text-slate-600">{candidate.productSummary ?? candidate.productTitle ?? "Untitled work"}</p>
      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        {candidate.awb ? <p className="break-all"><b>AWB:</b> {candidate.awb}</p> : null}
        {candidate.trackingId ? <p className="break-all"><b>Tracking ID:</b> {candidate.trackingId}</p> : null}
        {candidate.orderNumber ? <p className="break-words"><b>Order:</b> {candidate.orderNumber}</p> : null}
        {candidate.shipmentId ? <p className="break-words"><b>Shipment:</b> {candidate.shipmentId}</p> : null}
        {candidate.consignmentNumber ? <p className="break-words"><b>Consignment:</b> {candidate.consignmentNumber}</p> : null}
        {candidate.taskReference ? <p><b>Stage:</b> {candidate.stage} / {candidate.taskReference}</p> : null}
        {candidate.itemReference ? <p><b>Item:</b> {candidate.itemReference}</p> : null}
        {candidate.fsn ? <p className="break-words"><b>FSN:</b> {candidate.fsn}</p> : null}
        {candidate.listingId ? <p className="break-words"><b>Listing:</b> {candidate.listingId}</p> : null}
        {candidate.asin ? <p className="break-words"><b>ASIN:</b> {candidate.asin}</p> : null}
        {candidate.fnsku ? <p className="break-words"><b>FNSKU:</b> {candidate.fnsku}</p> : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">Matched {candidate.matchType.replaceAll("_", " ")} {candidate.matchedIdentifierMasked}</p>
      {candidate.stage === "MARK" ? <MarkingInstructions candidate={candidate}/> : null}
      {candidate.stage === "ASSEMBLE" ? <div className="mt-3 rounded-md bg-slate-50 p-3"><p className="font-black">{candidate.assemblyTitle ?? "Assembly"}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{candidate.assemblyInstructions ?? "Instructions unavailable. Ask an owner."}</p><p className="mt-1 text-xs font-bold text-slate-500">Source: {candidate.assemblySource ?? "Unknown"}</p></div> : null}
      {candidate.assignedUserName ? <p className="mt-1 text-xs text-slate-500">Assigned to {candidate.assignedUserName}</p> : null}
    </div>
    <div className="col-span-2 min-w-0 xl:col-span-1" data-scanner-workflow>
      <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Workflow status</h3>
      <WorkState candidate={candidate}/>
      {candidate.workflowPrerequisites?<WorkflowStateGrid workflow={candidate.workflowPrerequisites}/>:null}
      {candidate.shipmentItemCount ? <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-bold"><span>{candidate.shipmentItemCount} item(s)</span><span>Total {candidate.shipmentTotalQuantity}</span>{candidate.status!=="PACKED"?<><span>Picked {candidate.pickedItemCount}</span><span>Waiting {candidate.unpickedItemCount}</span></>:null}</div> : <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-bold"><span>Quantity {candidate.requiredQuantity}</span><span>Completed {candidate.completedQuantity}</span></div>}
      {candidate.readOnlyReason ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm font-bold text-amber-900">{candidate.readOnlyReason}</p> : null}
    </div>
    <div className="col-span-2 grid content-start gap-2 sm:grid-cols-2 xl:col-span-1 xl:grid-cols-1" data-scanner-actions>
      {candidate.canAct && (candidate.actionType==="ORDER_PICK"||candidate.actionType==="CONSIGNMENT_PICK")&&candidate.routeDecision?<ScannerPickRouteDialog candidate={{actionType:candidate.actionType,accountId:candidate.accountId,sourceId:candidate.sourceId,status:candidate.status,completedQuantity:candidate.completedQuantity,candidateKey:candidate.candidateKey,recommendationSource:candidate.routeDecision.recommendationSource,savedRoute:candidate.routeDecision.savedRoute,options:candidate.routeDecision.options}} scan={{returnPath,code,intent,sourceFilter,accountFilter}}/>:null}
      {candidate.canAct && candidate.actionType === "ORDER_SEND_TO_ASSEMBLY" ? <AssemblyDiversionForm candidate={candidate} code={code} intent={intent} accountFilter={accountFilter} returnPath={returnPath} token={token}/> : null}
      {actions.map((action)=><form key={action.value} action={universalCandidateAction}><input type="hidden" name="returnPath" value={returnPath}/><input type="hidden" name="code" value={code}/><input type="hidden" name="intent" value={intent}/><input type="hidden" name="source" value={sourceFilter}/><input type="hidden" name="accountFilter" value={accountFilter ?? ""}/><input type="hidden" name="accountId" value={candidate.accountId}/><input type="hidden" name="sourceId" value={candidate.sourceId}/><input type="hidden" name="action" value={action.value}/><input type="hidden" name="expectedQuantity" value={candidate.completedQuantity}/><input type="hidden" name="expectedStatus" value={candidate.status}/><input type="hidden" name="clientRequestId" value={`${token}:${action.value}`}/><SubmitButton pendingText="Saving...">{action.label}</SubmitButton></form>)}
      <Link href={detailsHref(candidate)} className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-center font-bold">Open Details</Link>
      <a href="#universal-scan-form" className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-center font-bold">Scan Next</a>
    </div>
  </article>;
}

function candidateScopeLabel(candidate: UniversalWorkCandidate) {
  if (candidate.actionType === "ORDER_PICK") return "Customer Order — Pick pending";
  if (candidate.actionType === "ORDER_PACK" || candidate.sourceType === "CUSTOMER_ORDER_SHIPMENT") {
    return `${candidate.marketplace} package — ${candidate.canAct ? "Pack ready" : "Pack locked"}`;
  }
  if (candidate.actionType === "CONSIGNMENT_PICK") return "Consignment line — Pick pending";
  if (candidate.stage) return `${candidate.sourceLabel} — ${candidate.stage[0]}${candidate.stage.slice(1).toLowerCase()} ${candidate.status.replaceAll("_", " ").toLowerCase()}`;
  return `${candidate.sourceLabel} — Read-only result`;
}

function detailsHref(candidate:UniversalWorkCandidate){if(candidate.sourceType==="CONSIGNMENT_TASK")return `/work/consignments/items/${encodeURIComponent(candidate.taskId??candidate.sourceId)}`;if(candidate.workGroupKey&&candidate.stage)return `/work/groups/${candidate.stage.toLowerCase()}/${encodeURIComponent(candidate.workGroupKey)}?source=ORDER`;if(candidate.stage)return `/work/${candidate.stage.toLowerCase()}?source=ORDER`;return `/packing/${encodeURIComponent(candidate.orderId??candidate.sourceId)}`;}
function WorkState({candidate}:{candidate:UniversalWorkCandidate}){const packed=candidate.status==="PACKED"||candidate.status==="COMPLETED",label=packed?"PACKED":candidate.status==="PROBLEM"?`${candidate.stage??"Current"} problem`:candidate.status==="PACK_READY"?"Pack ready":candidate.stage==="MARK"?`Mark ${candidate.status==="IN_PROGRESS"?"in progress":"pending"} · Pack locked`:candidate.stage==="ASSEMBLE"?`Assembly ${candidate.status==="IN_PROGRESS"?"in progress":"pending"} · Pack locked`:candidate.stage==="PICK"||candidate.status==="PICK_PENDING"?`Pick ${candidate.status==="IN_PROGRESS"?"in progress":"pending"} · Pack locked`:candidate.status.replaceAll("_"," ");return <div className={`mt-3 rounded-md border p-3 text-sm font-black ${packed?"border-teal-300 bg-teal-50 text-teal-900":"border-amber-300 bg-amber-50 text-amber-950"}`}><p>{label}</p>{candidate.problemReason?<p className="mt-1 font-medium">Reason: {candidate.problemReason.replaceAll("_"," ")}</p>:null}{packed?<p className="mt-1 font-medium">Packed by {candidate.packedByName??"recorded worker"}{candidate.packedAt?` · ${candidate.packedAt.toLocaleString()}`:""}</p>:null}</div>}

function AssemblyDiversionForm({candidate,code,intent,accountFilter,returnPath,token}:{candidate:UniversalWorkCandidate;code:string;intent:UniversalScanIntent;accountFilter?:string;returnPath:string;token:string}) {
  return <details className="rounded-md border p-2 sm:w-72"><summary className="min-h-11 cursor-pointer py-2 font-bold text-berry">Send to Assembly</summary><form action={universalCandidateAction} className="mt-2 grid gap-2"><input type="hidden" name="returnPath" value={returnPath}/><input type="hidden" name="code" value={code}/><input type="hidden" name="intent" value={intent}/><input type="hidden" name="accountFilter" value={accountFilter ?? ""}/><input type="hidden" name="accountId" value={candidate.accountId}/><input type="hidden" name="sourceId" value={candidate.sourceId}/><input type="hidden" name="action" value="ASSEMBLY_SEND"/><input type="hidden" name="expectedQuantity" value={candidate.completedQuantity}/><input type="hidden" name="expectedStatus" value={candidate.status}/><input type="hidden" name="clientRequestId" value={`${token}:ASSEMBLY_SEND`}/><input name="manualTitle" maxLength={160} placeholder="Assembly title (optional)" className="min-h-11 rounded-md border px-3"/><textarea name="manualInstructions" required={candidate.assemblyInstructionsRequired} maxLength={2000} placeholder={candidate.assemblyInstructionsRequired ? "Assembly instructions required" : "Optional rule note"} className="min-h-24 rounded-md border p-3"/><input name="manualImageUrl" maxLength={2048} placeholder="Optional safe image URL" className="min-h-11 rounded-md border px-3"/><SubmitButton pendingText="Sending...">Send to Assembly</SubmitButton></form></details>;
}

function MarkingInstructions({ candidate }: { candidate: UniversalWorkCandidate }) {
  return <details className="mt-3 rounded-md bg-slate-50 p-3"><summary className="cursor-pointer font-black">Marking instructions</summary><div className="mt-2 grid gap-1 text-sm"><p>{candidate.markingMasterDesignId ?? "No Master Design ID"} / {candidate.markingAssetName ?? "No marking asset"}</p><p>{candidate.markingPosition ?? "Position not set"}</p><p>{candidate.markingWidthMm ?? "-"} x {candidate.markingHeightMm ?? "-"} mm / Power {candidate.markingPower ?? "-"} / Speed {candidate.markingSpeed ?? "-"} / Frequency {candidate.markingFrequency ?? "-"} / Passes {candidate.markingPasses ?? "-"}</p><p>{candidate.markingInstructions ?? "No extra instructions"}</p></div></details>;
}
