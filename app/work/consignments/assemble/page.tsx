import { WorkerQueuePage } from "../../WorkerQueuePage";
export default function Page({searchParams}:{searchParams:Promise<{page?:string;q?:string;status?:string;success?:string;error?:string}>}) {
  return <WorkerQueuePage stage="ASSEMBLE" title="Consignment Assembly" description="Complete assembly only after every prior route stage is finished." searchParams={searchParams}/>;
}
