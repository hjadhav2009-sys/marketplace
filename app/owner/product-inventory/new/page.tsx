import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount,requireUser } from "@/lib/auth";
import { ListingForm } from "../ListingForm";
import { createManualListingAction } from "../manual-actions";

export default async function NewListingPage(){const user=await requireUser(["OWNER"]),account=await requireAccount(user);return <AppShell><div className="mx-auto max-w-3xl"><PageHeader eyebrow="Manual catalog" title="Create Product Inventory Listing" description="Seller SKU is required. All descriptive fields are optional; this does not create physical stock."/><ListingForm action={createManualListingAction} marketplace={account.marketplace} clientRequestId={randomUUID()}/></div></AppShell>}
