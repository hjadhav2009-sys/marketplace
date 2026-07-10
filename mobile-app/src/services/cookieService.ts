import type { RefObject } from "react";
import type WebView from "react-native-webview";

export function clearWebSession(webViewRef: RefObject<WebView | null>) {
  webViewRef.current?.injectJavaScript(`
    (async function () {
      try { await fetch('/api/mobile/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
      try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
      try { document.cookie.split(';').forEach(function (cookie) { document.cookie = cookie.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/'); }); } catch (_) {}
      true;
    })();
  `);
  webViewRef.current?.clearCache?.(true);
}
