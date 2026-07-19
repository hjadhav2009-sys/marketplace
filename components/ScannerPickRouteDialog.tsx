"use client";

import { useEffect, useState } from "react";
import { universalCandidateAction } from "@/app/work/scan/actions";
import { SubmitButton } from "./SubmitButton";

type Route = "DIRECT_PACK" | "MARK" | "ASSEMBLE" | "MARK_ASSEMBLE";
type Option = { route: Route; reasonRequired: boolean; missingInstructionStages: string[] };
const LABEL: Record<Route, string> = { DIRECT_PACK: "Direct to Pack", MARK: "Send to Marking", ASSEMBLE: "Send to Assembly", MARK_ASSEMBLE: "Marking then Assembly" };

export function ScannerPickRouteDialog({ candidate, scan }: {
  candidate: { actionType: string; accountId: string; sourceId: string; status: string; completedQuantity: number; candidateKey: string; recommendationSource: string; savedRoute: Route; options: Option[] };
  scan: { returnPath: string; code: string; intent: string; sourceFilter: string; accountFilter?: string };
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);
  const [requestNonce, setRequestNonce] = useState("");

  useEffect(() => {
    if (!open) return;
    if (!requestNonce) setRequestNonce(crypto.randomUUID());
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setSelected(null); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, requestNonce]);

  const hidden = selected ? <>
    <input type="hidden" name="returnPath" value={scan.returnPath}/>
    <input type="hidden" name="code" value={scan.code}/>
    <input type="hidden" name="intent" value={scan.intent}/>
    <input type="hidden" name="source" value={scan.sourceFilter}/>
    <input type="hidden" name="accountFilter" value={scan.accountFilter ?? ""}/>
    <input type="hidden" name="accountId" value={candidate.accountId}/>
    <input type="hidden" name="sourceId" value={candidate.sourceId}/>
    <input type="hidden" name="action" value={candidate.actionType === "ORDER_PICK" ? "ORDER_PICK_ROUTE" : "TASK_PICK_ROUTE"}/>
    <input type="hidden" name="route" value={selected.route}/>
    <input type="hidden" name="expectedQuantity" value={candidate.completedQuantity}/>
    <input type="hidden" name="expectedStatus" value={candidate.status}/>
    <input type="hidden" name="clientRequestId" value={requestNonce}/>
    {selected.reasonRequired ? <input type="hidden" name="routeReason" value="Other"/> : null}
    {selected.missingInstructionStages.length ? <input type="hidden" name="confirmMissingInstructions" value="1"/> : null}
  </> : null;

  const close = () => { setOpen(false); setSelected(null); setRequestNonce(""); };
  return <>
    <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-xl bg-slate-950 px-3 font-black text-white">Picked — choose route</button>
    {open ? <div className="fixed inset-0 z-[80] flex items-center justify-center p-3" data-scanner-route-dialog>
      <button type="button" aria-label="Close route dialog" onClick={close} className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"/>
      <div role="dialog" aria-modal="true" aria-labelledby="scanner-route-title" className="relative max-h-[calc(100vh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex justify-between gap-3"><div><p className="text-xs font-black uppercase text-berry">Scanner Pick</p><h2 id="scanner-route-title" className="text-xl font-black">{selected ? LABEL[selected.route] : "Choose next route"}</h2></div><button type="button" aria-label="Close" onClick={close} className="min-h-11 min-w-11 rounded-xl border text-xl">×</button></div>
        {!selected ? <><p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-bold">{candidate.recommendationSource === "SYSTEM_FALLBACK" ? "SYSTEM FALLBACK — DIRECT TO PACK" : `Saved route: ${LABEL[candidate.savedRoute]}`}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{candidate.options.map(option => <button key={option.route} type="button" onClick={() => setSelected(option)} className="min-h-12 rounded-xl border px-3 text-left text-sm font-black">{LABEL[option.route]}</button>)}</div></> :
          <form action={universalCandidateAction} className="mt-4 grid gap-3">{hidden}
            {selected.reasonRequired ? <label className="text-sm font-black">Why are you changing the saved route?<textarea autoFocus name="routeOtherReason" required maxLength={240} className="mt-2 min-h-24 w-full rounded-xl border p-3" placeholder="Enter a short operational reason"/></label> : null}
            {selected.missingInstructionStages.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-black">Saved instructions are unavailable.</p><p className="mt-1">You may add a note before continuing. No machine settings or directions will be invented.</p></div> : candidate.recommendationSource === "SYSTEM_FALLBACK" ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-bold">No override reason is required for a system fallback.</p> : null}
            <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-black">Add note (optional)</summary><textarea name="workerNote" maxLength={240} className="mt-2 min-h-20 w-full rounded-xl border p-3"/></details>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSelected(null)} className="min-h-11 rounded-xl border font-black">Cancel</button><SubmitButton pendingText="Routing...">Continue</SubmitButton></div>
          </form>}
      </div>
    </div> : null}
  </>;
}
