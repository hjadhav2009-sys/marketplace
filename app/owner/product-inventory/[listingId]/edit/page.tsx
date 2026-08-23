import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/PageHeader';
import { ProfessionalListingForm } from '@/components/ProfessionalListingForm';
import { requireAccount, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateManualListingAction } from '../../manual-actions';

export default async function EditListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const user = await requireUser(['OWNER']);
  const account = await requireAccount(user);
  const { listingId } = await params;
  const listing = await prisma.marketplaceListing.findFirst({ where: { id: listingId, accountId: account.id } });
  if (!listing) notFound();
  return <AppShell><div className='mx-auto max-w-4xl'><PageHeader eyebrow='Manual catalog' title='Edit Product Inventory Listing' description='Update owner-controlled catalog detail without changing protected seller identity or marketplace ownership.'/><ProfessionalListingForm action={updateManualListingAction} marketplace={account.marketplace} clientRequestId={randomUUID()} listing={listing}/></div></AppShell>;
}
