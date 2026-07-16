import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { UniversalScannerPanel } from "@/components/UniversalScannerPanel";
import { requireAccount, requireUser } from "@/lib/auth";
import type { UniversalScanIntent, UniversalSourceFilter } from "@/src/lib/workflow/universal-resolver";

export default async function UniversalScanPage({searchParams}:{searchParams:Promise<{q?:string;intent?:string;source?:string;scanSuccess?:string;scanError?:string}>}){const user=await requireUser();const account=await requireAccount(user);const query=await searchParams;const intent=["PICK","MARK","ASSEMBLE","PACK"].includes(query.intent??"")?query.intent as UniversalScanIntent:"ANY";const source=["CUSTOMER_ORDERS","CONSIGNMENTS"].includes(query.source??"")?query.source as UniversalSourceFilter:"ALL";return <AppShell><PageHeader eyebrow={account.accountDisplayName??account.name} title="Universal Work Scan" description="Exact active work in the currently selected seller account. Scanning never mutates work."/><UniversalScannerPanel actorUserId={user.id} selectedAccountId={account.id} query={query.q} intent={intent} sourceFilter={source} success={query.scanSuccess} error={query.scanError}/></AppShell>}
