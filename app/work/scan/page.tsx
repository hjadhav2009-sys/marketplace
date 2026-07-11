import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { UniversalScannerPanel } from "@/components/UniversalScannerPanel";
import { requireUser } from "@/lib/auth";
import type { UniversalScanIntent } from "@/src/lib/workflow/universal-resolver";

export default async function UniversalScanPage({searchParams}:{searchParams:Promise<{q?:string;intent?:string;accountId?:string;scanSuccess?:string;scanError?:string}>}){const user=await requireUser();const query=await searchParams;const intent=["PICK","MARK","ASSEMBLE","PACK"].includes(query.intent??"")?query.intent as UniversalScanIntent:"ANY";return <AppShell><PageHeader eyebrow="All authorized accounts" title="Universal Work Scan" description="Scan once, review every exact active match, then choose an explicit action."/><UniversalScannerPanel actorUserId={user.id} query={query.q} intent={intent} accountId={query.accountId} success={query.scanSuccess} error={query.scanError}/></AppShell>}
