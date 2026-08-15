import { PickWorkspace, type PickSearchParams } from "./PickWorkspace";

export default function Page({ searchParams }: { searchParams: PickSearchParams }) {
  return <PickWorkspace searchParams={searchParams} />;
}
