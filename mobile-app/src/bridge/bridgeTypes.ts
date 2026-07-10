export const WEB_TO_NATIVE_TYPES = [
  "OPEN_SCANNER",
  "DOWNLOAD_FILE",
  "OPEN_EXTERNAL",
  "CHANGE_SERVER",
  "CHECK_APP_UPDATE",
  "HAPTIC_FEEDBACK",
  "GET_NATIVE_INFO",
  "CLEAR_APP_SESSION"
] as const;

export const NATIVE_TO_WEB_TYPES = [
  "NATIVE_READY",
  "SCAN_RESULT",
  "SCAN_CANCELLED",
  "SCAN_ERROR",
  "DOWNLOAD_STARTED",
  "DOWNLOAD_COMPLETE",
  "DOWNLOAD_ERROR",
  "CONNECTION_STATUS",
  "APP_UPDATE_STATUS",
  "NATIVE_INFO"
] as const;

export type WebToNativeType = (typeof WEB_TO_NATIVE_TYPES)[number];
export type NativeToWebType = (typeof NATIVE_TO_WEB_TYPES)[number];

export type BridgeMessage<TType extends string = string, TPayload = unknown> = {
  version: 1;
  type: TType;
  requestId: string;
  payload: TPayload;
};

export function parseBridgeMessage(raw: string): BridgeMessage<WebToNativeType> | null {
  try {
    const value = JSON.parse(raw) as Partial<BridgeMessage>;

    if (
      value.version !== 1 ||
      typeof value.type !== "string" ||
      !WEB_TO_NATIVE_TYPES.includes(value.type as WebToNativeType) ||
      typeof value.requestId !== "string" ||
      value.requestId.length < 1 ||
      value.requestId.length > 80 ||
      typeof value.payload !== "object" ||
      value.payload === null
    ) {
      return null;
    }

    return value as BridgeMessage<WebToNativeType>;
  } catch {
    return null;
  }
}
