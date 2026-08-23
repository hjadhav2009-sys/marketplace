import { MissingListingResolutionWorkspace } from '@/components/MissingListingResolutionWorkspace';

export default function MissingListingIssuePage({ params, searchParams }: {
  params: Promise<{ issueId: string }>;
  searchParams: Promise<{ action?: string; listingQ?: string }>;
}) {
  return <MissingListingResolutionWorkspace params={params} searchParams={searchParams}/>;
}
