import { buildWebEventScript } from "./webMessageInjector";

export function buildUpdateStatusScript(requestId: string, available: boolean, mandatory: boolean) {
  return buildWebEventScript("APP_UPDATE_STATUS", requestId, { available, mandatory });
}
