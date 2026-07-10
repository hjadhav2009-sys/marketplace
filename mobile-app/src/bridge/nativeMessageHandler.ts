import { parseBridgeMessage } from "./bridgeTypes";

export function getValidatedBridgeMessage(raw: string, pageUrl: string, serverUrl: string) {
  try {
    if (new URL(pageUrl).origin !== new URL(serverUrl).origin) {
      return null;
    }
  } catch {
    return null;
  }

  return parseBridgeMessage(raw);
}
