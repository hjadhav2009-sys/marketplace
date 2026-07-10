"use client";

type NativeBridgeWindow = Window & {
  __MARKETPLACE_NATIVE_APP__?: { version: number; platform: string };
  ReactNativeWebView?: { postMessage: (message: string) => void };
};

type NativeScanResult = {
  code: string;
  format?: string;
  requestId: string;
};

export function isMarketplaceNativeApp() {
  if (typeof window === "undefined") return false;
  const nativeWindow = window as NativeBridgeWindow;
  return Boolean(nativeWindow.__MARKETPLACE_NATIVE_APP__ || /MarketplacePickPackNative/i.test(navigator.userAgent));
}

export function postNativeBridgeMessage(type: string, payload: Record<string, unknown> = {}, requestId = crypto.randomUUID()) {
  if (typeof window === "undefined") return null;
  const nativeWindow = window as NativeBridgeWindow;
  if (!nativeWindow.ReactNativeWebView || !isMarketplaceNativeApp()) return null;

  nativeWindow.ReactNativeWebView.postMessage(JSON.stringify({ version: 1, type, requestId, payload }));
  return requestId;
}

export function requestNativeScanner() {
  return postNativeBridgeMessage("OPEN_SCANNER");
}

export function listenForNativeScanResult(callback: (result: NativeScanResult) => void) {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<Partial<NativeScanResult>>).detail;
    if (typeof detail?.code !== "string" || typeof detail?.requestId !== "string") return;
    callback({ code: detail.code, format: detail.format, requestId: detail.requestId });
  };

  window.addEventListener("marketplace:native-scan-result", listener);
  return () => window.removeEventListener("marketplace:native-scan-result", listener);
}

export function requestNativeUpdateCheck() {
  return postNativeBridgeMessage("CHECK_APP_UPDATE");
}

export function requestNativeServerChange() {
  return postNativeBridgeMessage("CHANGE_SERVER");
}
