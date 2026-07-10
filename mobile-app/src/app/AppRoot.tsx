import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import { buildScannerCancelledScript, buildScannerResultScript } from "../bridge/scannerBridge";
import { clearWebSession } from "../services/cookieService";
import { testServerConnection } from "../services/connectionService";
import { checkForAppUpdate, getCurrentVersion, isMandatoryUpdate, type AppUpdateMetadata } from "../services/updateService";
import { getDismissedUpdateVersion, setDismissedUpdateVersion } from "../storage/appPreferenceStorage";
import { clearServerUrl, getServerUrl } from "../storage/serverStorage";
import type { AppShellState, OfflineReason } from "./AppState";
import { AppUpdateScreen } from "../screens/AppUpdateScreen";
import { BootScreen } from "../screens/BootScreen";
import { NativeSettingsScreen } from "../screens/NativeSettingsScreen";
import { OfflineScreen } from "../screens/OfflineScreen";
import { ScannerScreen } from "../screens/ScannerScreen";
import { ServerSettingsScreen } from "../screens/ServerSettingsScreen";
import { WebAppScreen } from "../screens/WebAppScreen";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

export function AppRoot() {
  const webViewRef = useRef<WebView | null>(null);
  const [state, setState] = useState<AppShellState>("boot");
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [offlineReason, setOfflineReason] = useState<OfflineReason>("server");
  const [hasConnected, setHasConnected] = useState(false);
  const [scannerRequestId, setScannerRequestId] = useState<string | null>(null);
  const scannerStartedAt = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [update, setUpdate] = useState<AppUpdateMetadata | null>(null);

  const evaluateUpdate = useCallback(async (url: string, force = false) => {
    const metadata = await checkForAppUpdate(url);
    if (!metadata?.available || getCurrentVersion().versionCode >= metadata.latestVersionCode) {
      if (force) setUpdate(null);
      return;
    }

    const dismissed = await getDismissedUpdateVersion();
    if (force || isMandatoryUpdate(metadata) || dismissed !== metadata.latestVersionName) setUpdate(metadata);
  }, []);

  const connect = useCallback(async (url: string) => {
    setState("boot");
    const result = await testServerConnection(url);
    if (__DEV__) console.info(`[mobile-timing] server-check ${result.durationMs}ms`);

    if (!result.ok) {
      setOfflineReason(result.reason);
      setState("offline");
      return;
    }

    setHasConnected(true);
    setState("web");
    void evaluateUpdate(url);
  }, [evaluateUpdate]);

  useEffect(() => {
    const startedAt = Date.now();
    getServerUrl()
      .then((saved) => {
        if (!saved) {
          setState("server-settings");
          return;
        }
        setServerUrl(saved);
        void connect(saved);
      })
      .catch(() => setState("server-settings"))
      .finally(() => {
        if (__DEV__) console.info(`[mobile-timing] boot ${Date.now() - startedAt}ms`);
      });
  }, [connect]);

  async function changeServer() {
    clearWebSession(webViewRef);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await clearServerUrl();
    setSettingsOpen(false);
    setUpdate(null);
    setHasConnected(false);
    setServerUrl(null);
    setState("server-settings");
  }

  function finishScan(code: string, format?: string) {
    if (!scannerRequestId) return;
    webViewRef.current?.injectJavaScript(buildScannerResultScript(scannerRequestId, code, format));
    if (__DEV__) console.info(`[mobile-timing] scanner-open-to-injection ${Date.now() - scannerStartedAt.current}ms`);
    setScannerRequestId(null);
  }

  function openScanner(requestId: string) {
    scannerStartedAt.current = Date.now();
    setScannerRequestId(requestId);
  }

  function cancelScan() {
    if (scannerRequestId) webViewRef.current?.injectJavaScript(buildScannerCancelledScript(scannerRequestId));
    setScannerRequestId(null);
  }

  const mandatoryUpdate = update ? isMandatoryUpdate(update) : false;
  const showWebView = Boolean(serverUrl && hasConnected);

  return (
    <View style={styles.root}>
      {showWebView && serverUrl ? (
        <WebAppScreen
          onCheckUpdate={() => void evaluateUpdate(serverUrl, true)}
          onOffline={() => { setOfflineReason("webview"); setState("offline"); }}
          onOpenScanner={openScanner}
          onOpenSettings={() => setSettingsOpen(true)}
          serverUrl={serverUrl}
          webViewRef={webViewRef}
        />
      ) : null}

      {!showWebView && state === "boot" ? <BootScreen /> : null}
      {!showWebView && state === "server-settings" ? (
        <ServerSettingsScreen currentUrl={serverUrl} onSaved={(url) => { setServerUrl(url); void connect(url); }} />
      ) : null}
      {!showWebView && state === "offline" && serverUrl ? (
        <OfflineScreen onChangeServer={changeServer} onRetry={() => void connect(serverUrl)} reason={offlineReason} serverUrl={serverUrl} />
      ) : null}

      <Modal animationType="slide" onRequestClose={cancelScan} visible={Boolean(scannerRequestId)}>
        <ScannerScreen onCancel={cancelScan} onScanned={finishScan} />
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setSettingsOpen(false)} visible={settingsOpen}>
        {serverUrl ? (
          <NativeSettingsScreen
            onChangeServer={changeServer}
            onCheckUpdate={() => { setSettingsOpen(false); void evaluateUpdate(serverUrl, true); }}
            onClearCache={() => { webViewRef.current?.clearCache?.(true); webViewRef.current?.reload(); }}
            onClearSession={() => { clearWebSession(webViewRef); setSettingsOpen(false); setTimeout(() => webViewRef.current?.reload(), 250); }}
            onClose={() => setSettingsOpen(false)}
            onOpenHome={() => { webViewRef.current?.injectJavaScript("location.href='/dashboard';true;"); setSettingsOpen(false); }}
            onScannerTest={() => { setSettingsOpen(false); setScannerRequestId("native-settings-test"); }}
            serverUrl={serverUrl}
          />
        ) : null}
      </Modal>

      <Modal animationType="fade" onRequestClose={() => { if (!mandatoryUpdate) setUpdate(null); }} visible={Boolean(update)}>
        {update && serverUrl ? (
          <AppUpdateScreen
            mandatory={mandatoryUpdate}
            onChangeServer={changeServer}
            onLater={() => { void setDismissedUpdateVersion(update.latestVersionName); setUpdate(null); }}
            serverUrl={serverUrl}
            update={update}
          />
        ) : null}
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setState("web")} transparent visible={showWebView && state === "offline"}>
        <View style={styles.overlay}>
          {serverUrl ? <OfflineScreen onChangeServer={changeServer} onRetry={() => void connect(serverUrl)} reason={offlineReason} serverUrl={serverUrl} /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: theme.colors.background, flex: 1 },
  overlay: { backgroundColor: theme.colors.background, flex: 1 }
});
