import { AssemblyWorkspace, type AssemblySearchParams } from "./AssemblyWorkspace";

export default function Page({ searchParams }: { searchParams: AssemblySearchParams }) {
  return <AssemblyWorkspace searchParams={searchParams}/>;
}
