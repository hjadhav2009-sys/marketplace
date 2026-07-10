import type { WebViewNavigation } from "react-native-webview";
import { isSafeExternalUrl } from "./safeUrl";

const BLOCKED_SCHEMES = /^(javascript|file|data|content|intent):/i;

export type NavigationDecision = "internal" | "external" | "blocked";

export function classifyNavigation(target: string, serverUrl: string): NavigationDecision {
  if (BLOCKED_SCHEMES.test(target)) {
    return "blocked";
  }

  try {
    const destination = new URL(target);
    const server = new URL(serverUrl);

    if (destination.protocol === server.protocol && destination.hostname === server.hostname && destination.port === server.port) {
      return "internal";
    }

    return isSafeExternalUrl(target) ? "external" : "blocked";
  } catch {
    return "blocked";
  }
}

export function navigationUrl(request: WebViewNavigation | { url: string }) {
  return request.url;
}
