import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProductInventoryDetails } from '@/components/ProductInventoryDetails';
import { requireAccount, requireUser } from '@/lib/auth';
import { loadProductDetail } from '@/lib/product-inventory-details';
import { prisma } from '@/lib/prisma';

export default async function ProductDetailPage({ params, searchParams }: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ empty?: string; attributeQ?: string; attributePage?: string }>;
}) {
  const user = await requireUser(['OWNER']);
  const account = await requireAccount(user);
  const [{ listingId }, query] = await Promise.all([params, searchParams]);
  const result = await loadProductDetail(prisma, {
    accountId: account.id,
    listingId,
    attributeQuery: query.attributeQ,
    attributePage: Number(query.attributePage) || 1
  });
  if (!result) notFound();
  return <AppShell><ProductInventoryDetails result={result} accountName={account.accountDisplayName ?? account.name} showEmpty={query.empty === '1'}/></AppShell>;
}
