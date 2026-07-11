import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAccount, requireUser, roleHomePath } from "@/lib/auth";
import { hasWorkPermission } from "@/lib/work-permissions";
import { getOrderWithImage } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { packingResultLabel } from "@/lib/operations/packing";
import { buildListingImageGallery } from "@/lib/product-image";
import { cacheSkuImageAction } from "@/app/owner/sku-mappings/actions";
import { confirmPackedAction, reportProblemFromScanAction } from "./actions";
import { sendOrderToAssemblyAction } from "@/app/work/assembly/actions";
import { canOfferManualAssemblyDiversion, getOrderAssemblyPackingGate } from "@/src/lib/workflow/order-assembly";

type ScanResultPageProps = {
  params: Promise<{
    awb: string;
  }>;
  searchParams?: Promise<{
    packed?: string;
    problem?: string;
    packError?: string;
    assemblySuccess?: string;
    assemblyError?: string;
  }>;
};

export default async function ScanResultPage({ params, searchParams }: ScanResultPageProps) {
  const user = await requireUser();
  const account = await requireAccount(user);
  if (!hasWorkPermission(user, "canPack")) redirect(roleHomePath(user.role));
  const { awb: encodedAwb } = await params;
  const awb = decodeURIComponent(encodedAwb);
  const result = await getOrderWithImage(account.id, awb);
  const query = await searchParams;

  if (!result) {
    notFound();
  }

  const { order, mapping, listing } = result;
  const shipmentItems = result.shipmentItems;
  const scopedItems = shipmentItems.length > 0 ? shipmentItems : [order];
  const assemblyGate = await getOrderAssemblyPackingGate({
    accountId: account.id,
    orders: scopedItems.map((item) => ({ id: item.id, accountId: account.id, sku: item.sku, productDescription: item.productDescription, imageUrl: item.imageUrl }))
  });
  const assemblyStateByOrder = new Map(assemblyGate.states.map((state) => [state.orderId, state]));
  const displayScanId = order.trackingId ?? order.awb;
  const scanLabel = order.trackingId ? "Tracking ID" : "AWB";
  const allPicked = scopedItems.every((item) => item.pickStatus === "PICKED");
  const canPack = order.packStatus === "READY" && allPicked && assemblyGate.allowed;
  const canReportProblem = order.packStatus === "READY";
  const openProblem = order.problemOrders[0];
  const imageUrl = mapping?.cachedImageUrl ?? null;
  const listingTitle = mapping?.productName ?? listing?.productTitle ?? listing?.liveTitle ?? order.productDescription ?? "Product details not mapped";
  const canCacheImage = user.role === "OWNER" && mapping?.id && mapping.imageUrl && mapping.cacheStatus !== "CACHED";
  const galleryImages = buildListingImageGallery(listing, mapping?.imageUrl ?? imageUrl);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Scan result"
        title={`${scanLabel} ${displayScanId}`}
        description="Verify the product image, SKU, quantity, color, courier, and order number before confirming packed."
      >
        <div className="flex flex-wrap gap-2">
          <StatusBadge value={order.packStatus} />
          <Link
            href="/packing"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-berry hover:text-berry"
          >
            Scan next
          </Link>
        </div>
      </PageHeader>

      {query?.packed === "already" ? (
        <div className="mb-5 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          This order is already packed. No duplicate update was made.
        </div>
      ) : query?.packed ? (
        <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
          Order marked as packed.
        </div>
      ) : null}

      {query?.packError ? (
        <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {query.packError}
        </div>
      ) : null}

      {query?.assemblySuccess ? <div className="mb-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">{query.assemblySuccess}</div> : null}
      {query?.assemblyError ? <div className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{query.assemblyError}</div> : null}
      {!allPicked && order.packStatus === "READY" ? <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">Shipment cannot be packed while one or more items are waiting for picking.</div> : null}
      {!assemblyGate.allowed ? <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{assemblyGate.blocker?.message}</div> : null}

      {query?.problem === "existing" ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          An open problem already exists for this order.
        </div>
      ) : query?.problem ? (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Problem order created.
        </div>
      ) : null}

      <section className="grid gap-5 pb-28 lg:grid-cols-[0.62fr_1.38fr] lg:pb-0">
        <div className="self-start overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:sticky lg:top-28">
          <ProductImageGallery
            primarySrc={imageUrl ?? galleryImages[0]}
            images={galleryImages}
            alt={`${listingTitle} ${order.sku}`}
            mappingId={mapping?.id}
            imageHealth={mapping?.imageHealth}
            cacheStatus={mapping?.cacheStatus}
            originalImageUrl={mapping?.imageUrl}
          />
          <div className="p-4">
            <p className="line-clamp-2 text-base font-semibold text-slate-700">
              {listingTitle}
            </p>
            {!imageUrl && user.role !== "OWNER" ? (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">Image not prepared.</p>
            ) : null}
            {canCacheImage ? (
              <form action={cacheSkuImageAction} className="mt-3">
                <input type="hidden" name="mappingId" value={mapping?.id} />
                <input type="hidden" name="returnTo" value={`/packing/${encodeURIComponent(order.awb)}`} />
                <button className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                  Cache now
                </button>
              </form>
            ) : null}
            <h2 className="mt-3 break-words text-2xl font-black text-slate-950">{order.sku}</h2>
            <div className="mt-4 rounded-md bg-slate-950 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Quantity to pack</p>
              <p className="mt-1 text-5xl font-black leading-none text-white">{order.qty}</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{order.productDescription ?? "No product description extracted yet."}</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="sticky top-24 z-20 hidden rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur lg:block">
            <div className="flex flex-wrap items-center gap-2">
              {canPack ? (
                <form action={confirmPackedAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <SubmitButton pendingText="Packing...">Pack</SubmitButton>
                </form>
              ) : null}
              <Link
                href="/packing"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm"
              >
                Scan next AWB
              </Link>
              {canReportProblem ? (
                <a href="#problem" className="inline-flex min-h-11 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900">
                  Problem
                </a>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 rounded-md bg-slate-950 p-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Pack status</p>
              <p className="mt-1 text-xl font-bold">{packingResultLabel(order)}</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Marketplace</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.marketplace}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Shipment ID</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.shipmentId ?? "Not mapped"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Order item ID</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.orderItemId ?? "Not mapped"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">FSN</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.fsn ?? listing?.fsn ?? "Not mapped"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Listing ID</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{listing?.listingId ?? "Not mapped"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Category</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{listing?.liveCategory ?? listing?.subCategory ?? "Not mapped"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Brand</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{listing?.liveBrand ?? "Not mapped"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Tracking ID</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.trackingId ?? "Not mapped"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">SKU</dt>
                <dd className="mt-1 break-words text-2xl font-bold text-slate-950">{order.sku}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Quantity</dt>
                <dd className="mt-1 text-4xl font-bold text-berry">{order.qty}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Color</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.color ?? mapping?.color ?? "Unknown"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Size</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.size ?? "Unknown"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Courier</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.courier ?? "Unknown"}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Account</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.account.name}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Order number</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.orderNo}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">AWB</dt>
                <dd className="mt-1 break-words font-semibold text-slate-950">{order.awb}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Payment</dt>
                <dd className="mt-1 font-semibold text-slate-950">{order.paymentType}</dd>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <dt className="text-sm font-medium text-slate-500">Destination</dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {[order.city, order.state].filter(Boolean).join(", ") || "Not extracted"}
                </dd>
              </div>
            </dl>
            {listing?.productHighlights || listing?.allSpecifications || listing?.description ? (
              <details className="mt-4 rounded-md bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Listing details</summary>
                <p className="mt-1 line-clamp-4 text-sm leading-6 text-slate-700">
                  {listing.productHighlights ?? listing.allSpecifications ?? listing.description}
                </p>
              </details>
            ) : null}
          </div>

          {shipmentItems.length > 1 ? (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 shadow-sm">
              <h3 className="font-semibold text-blue-950">Ready items under this Tracking ID</h3>
              <p className="mt-1 text-sm text-blue-800">Confirm packed will mark all ready items in this Flipkart shipment as packed.</p>
              <div className="mt-3 divide-y divide-blue-100 rounded-md bg-white">
                {shipmentItems.map((item) => (
                  <div key={item.id} className="grid gap-1 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="break-words font-bold text-slate-950">{item.sku}</p>
                      <p className="text-sm text-slate-600">{item.productDescription ?? item.orderItemId ?? item.awb}</p>
                    </div>
                    <p className="text-sm font-bold text-berry">Qty {item.qty}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {order.packStatus === "READY" ? (
            <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-950">Assembly</h3>
              <p className="mt-1 text-sm text-slate-600">Send only the applicable picked item. Packing stays blocked until every required assembly task is completed or skipped by an owner.</p>
              <div className="mt-3 grid gap-3">
                {scopedItems.map((item) => {
                  const state = assemblyStateByOrder.get(item.id);
                  const canOfferDiversion = canOfferManualAssemblyDiversion(state?.state);
                  return <div key={item.id} className="rounded-md bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words font-bold">{item.sku} / Qty {item.qty}</p><span className="rounded-full bg-white px-2 py-1 text-xs font-bold ring-1 ring-slate-200">{state?.state.replaceAll("_", " ") ?? "No assembly task"}</span></div>
                    {item.pickStatus === "PICKED" && canOfferDiversion ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-berry">Send to Assembly</summary><form action={sendOrderToAssemblyAction} className="grid gap-2 sm:grid-cols-2"><input type="hidden" name="orderId" value={item.id}/><input type="hidden" name="returnPath" value={`/packing/${encodeURIComponent(order.awb)}`}/><input type="hidden" name="clientRequestId" value={`packing-detail:${item.id}`}/><input name="manualTitle" maxLength={160} placeholder="Assembly title (optional)" className="min-h-11 rounded-md border px-3"/><input name="manualImageUrl" maxLength={2048} placeholder="Optional safe image URL" className="min-h-11 rounded-md border px-3"/><textarea name="manualInstructions" maxLength={2000} placeholder="Instructions required when no valid rule exists" className="min-h-24 rounded-md border p-3 sm:col-span-2"/><SubmitButton pendingText="Sending..." className="sm:col-span-2">Send to Assembly</SubmitButton></form></details> : null}
                    {state && !state.allowed ? <p className="mt-2 text-sm font-semibold text-amber-800">{state.message}</p> : null}
                  </div>;
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            {canPack ? (
              <form action={confirmPackedAction} className="hidden rounded-md border border-slate-200 bg-white p-4 shadow-sm md:block">
                <input type="hidden" name="orderId" value={order.id} />
                <h3 className="font-semibold text-slate-950">Confirm packed</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Use this after matching the label, product image, SKU, color, and quantity.
                </p>
                <div className="mt-4">
                  <SubmitButton pendingText="Confirming...">Confirm packed</SubmitButton>
                </div>
              </form>
            ) : order.packStatus === "PACKED" ? (
              <div className="rounded-md border border-teal-200 bg-teal-50 p-4 shadow-sm">
                <h3 className="font-semibold text-teal-900">Already packed</h3>
                <p className="mt-2 text-sm leading-6 text-teal-800">
                  This order has already been confirmed packed. No duplicate update is needed.
                </p>
                {order.packedAt ? (
                  <p className="mt-3 text-sm font-semibold text-teal-900">
                    Packed at {formatDateTime(order.packedAt)}
                  </p>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-teal-900">Packed time not recorded.</p>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <h3 className="font-semibold text-amber-950">Problem order</h3>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  Packing is paused for this AWB until the problem is resolved.
                </p>
                {openProblem ? (
                  <p className="mt-3 text-sm text-amber-900">
                    {openProblem.reason} - reported by {openProblem.reportedBy?.name ?? "Unknown"} on {formatDateTime(openProblem.createdAt)}
                  </p>
                ) : null}
              </div>
            )}

            {canReportProblem ? (
              <details id="problem" className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer text-base font-semibold text-slate-950">Mark problem</summary>
                <form action={reportProblemFromScanAction} className="mt-4">
                  <input type="hidden" name="orderId" value={order.id} />
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Reason</span>
                    <input
                      name="reason"
                      required
                      placeholder="Missing item, color mismatch..."
                      className="mt-1 min-h-12 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                    />
                  </label>
                  <label className="mt-3 block">
                    <span className="text-sm font-medium text-slate-700">Details</span>
                    <textarea
                      name="details"
                      rows={3}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none transition focus:border-berry focus:ring-2 focus:ring-pink-100"
                    />
                  </label>
                  <div className="mt-4">
                    <SubmitButton pendingText="Saving..." variant="secondary">
                      Save problem
                    </SubmitButton>
                  </div>
                </form>
              </details>
            ) : order.packStatus === "PACKED" ? (
              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="font-semibold text-slate-950">Problem reporting closed</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Packed orders cannot be marked as a new problem from this screen.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-white p-4 shadow-sm">
                <h3 className="font-semibold text-slate-950">Problem already open</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This order already has an open problem, so no duplicate problem form is shown.
                </p>
              </div>
            )}
          </div>

          <details className="rounded-md border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer border-b border-slate-200 px-4 py-3 font-semibold text-slate-950">Recent scan log</summary>
            <div className="divide-y divide-slate-100">
              {order.scanLogs.map((log) => (
                <div key={log.id} className="px-4 py-3 text-sm">
                  <p className="font-semibold text-slate-950">
                    {log.outcome} - {log.scannedBy?.name ?? "Unknown"}
                  </p>
                  <p className="text-slate-500">{formatDateTime(log.createdAt)}</p>
                </div>
              ))}
              {order.scanLogs.length === 0 ? (
                <div className="px-4 py-5 text-sm text-slate-500">No scans logged yet.</div>
              ) : null}
            </div>
          </details>
        </div>
      </section>

      <div className="mt-5 hidden lg:block">
        <Link href="/packing" className="rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
          Scan next AWB
        </Link>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl gap-2">
          {canPack ? (
            <form action={confirmPackedAction} className="flex-1">
              <input type="hidden" name="orderId" value={order.id} />
              <SubmitButton pendingText="Confirming..." className="w-full">
                Confirm packed
              </SubmitButton>
            </form>
          ) : null}
          <Link
            href="/packing"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-800 shadow-sm"
          >
            Scan next AWB
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
