import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProfessionalUniversalScanner } from "@/components/ProfessionalUniversalScanner";
import { capabilityHomePath, requireAccount, requireUser } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { redirect } from "next/navigation";
import type { UniversalScanIntent, UniversalSourceFilter } from "@/src/lib/workflow/universal-resolver";

export default async function UniversalScanPage({searchParams}:{searchParams:Promise<{q?:string;intent?:string;source?:string;scanSuccess?:string;scanError?:string}>}){const user=await requireUser();const canUseScanner=user.role==="OWNER"||hasWorkPermission(user,"canPick")||hasWorkPermission(user,"canMark")||hasWorkPermission(user,"canAssemble")||hasWorkPermission(user,"canPack")||hasWorkPermission(user,"canViewAllWork")||hasWorkPermission(user,"canManageConsignments");if(!canUseScanner)redirect(capabilityHomePath(user));const account=await requireAccount(user);const query=await searchParams;const intent=["PICK","MARK","ASSEMBLE","PACK"].includes(query.intent??"")?query.intent as UniversalScanIntent:"ANY";const source=["CUSTOMER_ORDERS","CONSIGNMENTS"].includes(query.source??"")?query.source as UniversalSourceFilter:"ALL";return <AppShell><PageHeader eyebrow={account.accountDisplayName??account.name} title="Universal Scan" description="Scan a product, package or work code to find the exact authorized work in the selected seller account."/><ProfessionalUniversalScanner actorUserId={user.id} selectedAccountId={account.id} query={query.q} intent={intent} sourceFilter={source} success={query.scanSuccess} error={query.scanError}/></AppShell>}
