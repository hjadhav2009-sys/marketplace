import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MarketplaceImportWizard } from "@/components/MarketplaceImportWizard";
import { PageHeader } from "@/components/PageHeader";
import { getAvailableAccounts, requireAccount, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importSkuMappingFileAction } from "@/app/owner/sku-mappings/import/actions";
import { createFlipkartOrderImportAction, createUploadBatchAction } from "../actions";

type UploadPageProps = {
  searchParams?: Promise<{
    error?: string;
    flipkartBatchId?: string;
  }>;
};

function errorText(error: string | undefined) {
  if (error === "account") {
    return "Choose a valid seller account.";
  }

  if (error === "missing-file") {
    return "Upload a legacy Meesho label PDF, manifest PDF, or both.";
  }

  if (error === "missing-flipkart-orders") {
    return "Upload a Flipkart Daily Orders Excel or CSV file.";
  }

  if (error === "invalid-flipkart-orders") {
    return "Choose a valid Flipkart .xlsx or .csv order export.";
  }

  if (error === "flipkart-order-import-failed") {
    return "The Flipkart order file could not be imported. Check the headers and try again.";
  }
  if (error === "amazon-daily-orders-disabled") return "Amazon Daily Orders are currently disabled. Product Catalog and Consignments remain available.";

  if (error === "too-large") {
    return "The PDF upload is larger than 100 MB. Split the marketplace download into smaller files and upload again.";
  }

  if (error === "parse-failed") {
    return "The PDF could not be parsed. Use text-based PDFs only; scanned image PDFs need OCR in a later phase.";
  }

  if (error === "legacy-pdf-review-only") {
    return "Legacy PDF parsing is available only as a Meesho compatibility review and cannot create production work.";
  }

  return error ? "Choose a valid marketplace import file." : null;
}

export default async function UploadBatchPage({ searchParams }: UploadPageProps) {
  const user = await requireUser(["OWNER"]);
  const selectedAccount = await requireAccount(user);
  const accounts = await getAvailableAccounts(user);
  const params = await searchParams;
  const flipkartBatch = params?.flipkartBatchId
    ? await prisma.uploadBatch.findFirst({
        where: {
          id: params.flipkartBatchId,
          accountId: selectedAccount.id
        }
      })
    : null;
  const errorMessage = errorText(params?.error);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Import"
        title="Upload marketplace files"
        description="Use Flipkart imports for the normal daily workflow. Legacy PDF imports are kept under Advanced."
      />

      {flipkartBatch ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Flipkart order import finished: {flipkartBatch.createdRows} created, {flipkartBatch.updatedRows} updated,{" "}
          {flipkartBatch.duplicateRows} duplicate, {flipkartBatch.missingImageRows} missing image mapping, {flipkartBatch.errorRows} held for review.{" "}
          <Link href={`/owner/uploads/${flipkartBatch.id}/review`} className="underline">
            Open review
          </Link>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <MarketplaceImportWizard
        accounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          code: account.code,
          companyName: account.companyName,
          marketplace: account.marketplace,
          accountDisplayName: account.accountDisplayName,
          accountCode: account.accountCode,
          active: account.active
        }))}
        selectedAccountId={selectedAccount.id}
        listingAction={importSkuMappingFileAction}
        flipkartOrdersAction={createFlipkartOrderImportAction}
        legacyPdfAction={createUploadBatchAction}
      />
    </AppShell>
  );
}
