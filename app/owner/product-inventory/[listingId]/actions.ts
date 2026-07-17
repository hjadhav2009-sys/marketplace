"use server";

import { revalidatePath } from "next/cache";
import { requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const LOCKABLE_CATALOG_FIELDS=["productTitle","listingStatus","liveBrand","liveCategory","subCategory","description","mrp","sellingPrice","mainImageUrl","imageUrl1","imageUrl2","imageUrl3","imageUrl4","imageUrl5","imageUrl6","imageUrl7","imageUrl8","imageUrl9","imageUrl10"] as const;

export async function saveCatalogFieldLocksAction(form:FormData){const user=await requireUser(["OWNER"]),account=await requireAccount(user),listingId=String(form.get("listingId")??""),selected=form.getAll("lockedField").map(String),locks=Object.fromEntries(LOCKABLE_CATALOG_FIELDS.map(field=>[field,selected.includes(field)]));await prisma.$transaction(async tx=>{const listing=await tx.marketplaceListing.findFirst({where:{id:listingId,accountId:account.id},select:{id:true}});if(!listing)throw new Error("Listing is unavailable.");await tx.marketplaceListing.update({where:{id:listing.id},data:{manualLocksJson:JSON.stringify(locks)}});await tx.auditLog.create({data:{userId:user.id,accountId:account.id,action:"CATALOG_FIELD_LOCKS_UPDATED",entityType:"MarketplaceListing",entityId:listing.id,metadata:JSON.stringify({lockedFields:Object.entries(locks).filter(([,locked])=>locked).map(([field])=>field)})}});});revalidatePath(`/owner/product-inventory/${listingId}`);}
