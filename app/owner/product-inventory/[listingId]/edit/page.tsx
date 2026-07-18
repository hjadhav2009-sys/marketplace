import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { requireAccount,requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ListingForm } from "../../ListingForm";
import { updateManualListingAction } from "../../manual-actions";
export default async function EditListingPage({params}:{params:Promise<{listingId:string}>}){const user=await requireUser(["OWNER"]),account=await requireAccount(user),{listingId}=await params,listing=await prisma.marketplaceListing.findFirst({where:{id:listingId,accountId:account.id}});if(!listing)notFound();return <AppShell><div className="mx-auto max-w-3xl"><PageHeader eyebrow="Manual catalog" title="Edit Product Inventory Listing" description="Seller identity remains protected. Manually locked values are preserved from automated refresh."/><ListingForm action={updateManualListingAction} marketplace={account.marketplace} clientRequestId={randomUUID()} listing={listing}/></div></AppShell>}
