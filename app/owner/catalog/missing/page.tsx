import { MissingListingsWorkspace } from '@/components/MissingListingsWorkspace';

export default function MissingCatalogPage({ searchParams }: {
  searchParams: Promise<{ page?: string; resolved?: string; source?: string; reason?: string; q?: string }>;
}) {
  return <MissingListingsWorkspace searchParams={searchParams}/>;
}
