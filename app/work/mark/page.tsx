import { MarkWorkspace, type MarkSearchParams } from "./MarkWorkspace";

export default function Page({ searchParams }: { searchParams: MarkSearchParams }) {
  return <MarkWorkspace searchParams={searchParams}/>;
}
