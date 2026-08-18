import { PackWorkspace, type PackSearchParams } from "./PackWorkspace";

export default function Page({ searchParams }: { searchParams: PackSearchParams }) {
  return <PackWorkspace searchParams={searchParams} />;
}
