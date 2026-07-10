import type { ProcessRoute } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProcessRuleInput = {
  route: ProcessRoute;
  markingAssetId?: string | null;
  assemblyTitle?: string | null;
  assemblyInstructions?: string | null;
  assemblyImageUrl?: string | null;
};

export function processRouteRequirements(route: ProcessRoute) {
  return {
    markingRequired: route === "PICK_MARK_PACK" || route === "PICK_MARK_ASSEMBLE_PACK",
    assemblyRequired: route === "PICK_ASSEMBLE_PACK" || route === "PICK_MARK_ASSEMBLE_PACK"
  };
}

export function validateProcessRule(input: ProcessRuleInput) {
  const requirements = processRouteRequirements(input.route);
  if (requirements.markingRequired && !input.markingAssetId) return { valid: false as const, message: "Select a marking asset for this route." };
  if (!requirements.markingRequired && input.markingAssetId) return { valid: false as const, message: "Ready-made or assembly-only routes cannot keep a marking asset." };
  if (requirements.assemblyRequired && !String(input.assemblyTitle ?? "").trim() && !String(input.assemblyInstructions ?? "").trim()) return { valid: false as const, message: "Add an assembly title or instructions." };
  if (input.assemblyImageUrl) {
    try {
      const url = new URL(input.assemblyImageUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") return { valid: false as const, message: "Assembly image URL must use HTTP or HTTPS." };
    } catch {
      return { valid: false as const, message: "Assembly image URL is invalid." };
    }
  }
  return { valid: true as const, requirements };
}

export async function setActiveProcessRule(input: ProcessRuleInput & { accountId: string; marketplaceListingId: string; actorUserId: string }) {
  const validation = validateProcessRule(input);
  if (!validation.valid) throw new Error(validation.message);

  const listing = await prisma.marketplaceListing.findFirst({ where: { id: input.marketplaceListingId, accountId: input.accountId }, select: { id: true } });
  if (!listing) throw new Error("Listing is not available in the selected account.");
  if (input.markingAssetId) {
    const asset = await prisma.markingAsset.findFirst({ where: { id: input.markingAssetId, active: true }, include: { listingLinks: { where: { marketplaceListingId: input.marketplaceListingId, active: true }, take: 1 } } });
    if (!asset || !asset.listingLinks.length) throw new Error("Marking asset must be linked to this listing first.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.productProcessRule.updateMany({ where: { marketplaceListingId: input.marketplaceListingId, active: true }, data: { active: false, updatedByUserId: input.actorUserId } });
    return tx.productProcessRule.create({
      data: {
        accountId: input.accountId,
        marketplaceListingId: input.marketplaceListingId,
        route: input.route,
        markingAssetId: input.markingAssetId ?? null,
        markingRequired: validation.requirements.markingRequired,
        assemblyRequired: validation.requirements.assemblyRequired,
        assemblyTitle: input.assemblyTitle?.trim() || null,
        assemblyInstructions: input.assemblyInstructions?.trim() || null,
        assemblyImageUrl: input.assemblyImageUrl?.trim() || null,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId
      }
    });
  });
}
