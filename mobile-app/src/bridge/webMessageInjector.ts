import type { BridgeMessage, NativeToWebType } from "./bridgeTypes";

export const BRIDGE_BOOTSTRAP_SCRIPT = `
(function () {
  if (window.__MARKETPLACE_NATIVE_BRIDGE_READY__) return true;
  window.__MARKETPLACE_NATIVE_BRIDGE_READY__ = true;
  window.__MARKETPLACE_NATIVE_APP__ = { version: 1, platform: 'android' };
  window.dispatchEvent(new CustomEvent('marketplace:native-ready', { detail: { version: 1 } }));
  true;
})();
`;

export function buildWebEventScript<TPayload>(type: NativeToWebType, requestId: string, payload: TPayload) {
  const message: BridgeMessage<NativeToWebType, TPayload> = {
    version: 1,
    type,
    requestId,
    payload
  };
  const serialized = JSON.stringify(message).replace(/</g, "\\u003c");

  return `
    (function () {
      var message = ${serialized};
      window.dispatchEvent(new CustomEvent('marketplace:native-message', { detail: message }));
      if (message.type === 'SCAN_RESULT') {
        window.dispatchEvent(new CustomEvent('marketplace:native-scan-result', { detail: Object.assign({ requestId: message.requestId }, message.payload) }));
      }
      true;
    })();
  `;
}
