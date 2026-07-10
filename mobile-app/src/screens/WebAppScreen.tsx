import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as NavigationBar from "expo-navigation-bar";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { BackHandler, Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { getValidatedBridgeMessage } from "../bridge/nativeMessageHandler";
import { buildWebEventScript, BRIDGE_BOOTSTRAP_SCRIPT } from "../bridge/webMessageInjector";
import { classifyNavigation } from "../security/allowedOrigin";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

type Props = {
  serverUrl: string;
  webViewRef: RefObject<WebView | null>;
  onOpenScanner: (requestId: string) => void;
  onOpenSettings: () => void;
  onCheckUpdate: () => void;
  onOffline: () => void;
};

export function WebAppScreen({ serverUrl, webViewRef, onOpenScanner, onOpenSettings, onCheckUpdate, onOffline }: Props) {
  const insets = useSafeAreaInsets();
  const [canGoBack, setCanGoBack] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pageUrl, setPageUrl] = useState(`${serverUrl}/login`);
  const lastBackAt = useRef(0);
  const firstLoadStartedAt = useRef(Date.now());

  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setButtonStyleAsync("dark").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }

      const now = Date.now();
      if (now - lastBackAt.current < 1800) return false;
      lastBackAt.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, webViewRef]);

  const openExternal = useCallback(async (url: string) => {
    if (/^https:/i.test(url)) await WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
    else await Linking.openURL(url).catch(() => undefined);
  }, []);

  const shouldLoad = useCallback((request: WebViewNavigation) => {
    const decision = classifyNavigation(request.url, serverUrl);
    if (decision === "internal") return true;
    if (decision === "external") void openExternal(request.url);
    return false;
  }, [openExternal, serverUrl]);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    const message = getValidatedBridgeMessage(event.nativeEvent.data, event.nativeEvent.url || pageUrl, serverUrl);
    if (!message) return;

    if (message.type === "OPEN_SCANNER") {
      onOpenScanner(message.requestId);
      return;
    }
    if (message.type === "CHANGE_SERVER") {
      onOpenSettings();
      return;
    }
    if (message.type === "CHECK_APP_UPDATE") {
      onCheckUpdate();
      return;
    }
    if (message.type === "HAPTIC_FEEDBACK") {
      await Haptics.selectionAsync().catch(() => undefined);
      return;
    }
    if (message.type === "GET_NATIVE_INFO") {
      webViewRef.current?.injectJavaScript(buildWebEventScript("NATIVE_INFO", message.requestId, { platform: Platform.OS, shellVersion: 1 }));
      return;
    }
    if (message.type === "OPEN_EXTERNAL") {
      const url = (message.payload as { url?: unknown }).url;
      if (typeof url === "string" && classifyNavigation(url, serverUrl) === "external") await openExternal(url);
      return;
    }
    if (message.type === "DOWNLOAD_FILE") {
      const url = (message.payload as { url?: unknown }).url;
      if (typeof url === "string" && classifyNavigation(url, serverUrl) === "internal") await Linking.openURL(url).catch(() => undefined);
      return;
    }
    if (message.type === "CLEAR_APP_SESSION") {
      webViewRef.current?.injectJavaScript("fetch('/api/mobile/auth/logout',{method:'POST',credentials:'include'}).finally(function(){location.href='/login';});true;");
    }
  }, [onCheckUpdate, onOpenScanner, onOpenSettings, openExternal, pageUrl, serverUrl, webViewRef]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar backgroundColor={theme.colors.surface} style="dark" />
      <View style={styles.toolbar}>
        <View style={styles.connectionDot} />
        <Text numberOfLines={1} style={styles.toolbarText}>Marketplace Pick & Pack</Text>
        <Pressable accessibilityLabel="Native settings" hitSlop={8} onPress={onOpenSettings} style={styles.settingsButton}>
          <Text style={styles.settingsGlyph}>⋮</Text>
        </Pressable>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: `${serverUrl}/login` }}
        applicationNameForUserAgent="MarketplacePickPackNative/0.1.0"
        androidLayerType="hardware"
        cacheEnabled
        cacheMode="LOAD_DEFAULT"
        domStorageEnabled
        incognito={false}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_BOOTSTRAP_SCRIPT}
        javaScriptEnabled
        mixedContentMode={serverUrl.startsWith("https:") ? "never" : "compatibility"}
        onError={onOffline}
        onHttpError={(event) => { if (event.nativeEvent.statusCode >= 500 && !loaded) onOffline(); }}
        onLoadEnd={() => {
          if (!loaded && __DEV__) console.info(`[mobile-timing] first-webview-load ${Date.now() - firstLoadStartedAt.current}ms`);
          setLoaded(true);
        }}
        onMessage={handleMessage}
        onNavigationStateChange={(state) => { setCanGoBack(state.canGoBack); setPageUrl(state.url); }}
        onShouldStartLoadWithRequest={shouldLoad}
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        startInLoadingState
        thirdPartyCookiesEnabled={false}
        style={styles.webView}
      />
      {!loaded ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <Text style={styles.loadingTitle}>Opening warehouse app...</Text>
          <Text style={styles.loadingCopy}>First load can take a moment. Later pages stay inside this WebView.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: theme.colors.surface, flex: 1 },
  toolbar: { alignItems: "center", backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border, borderBottomWidth: 1, flexDirection: "row", height: 42, paddingHorizontal: 12 },
  connectionDot: { backgroundColor: theme.colors.success, borderRadius: 4, height: 8, marginRight: 8, width: 8 },
  toolbarText: { color: theme.colors.text, flex: 1, fontSize: 14, fontWeight: "800" },
  settingsButton: { alignItems: "center", height: 38, justifyContent: "center", width: 42 },
  settingsGlyph: { color: theme.colors.text, fontSize: 26, lineHeight: 28 },
  webView: { backgroundColor: theme.colors.background, flex: 1 },
  loadingOverlay: { alignItems: "center", backgroundColor: theme.colors.background, bottom: 0, justifyContent: "center", left: 0, padding: 24, position: "absolute", right: 0, top: 42 },
  loadingTitle: { color: theme.colors.text, fontSize: 20, fontWeight: "900" },
  loadingCopy: { color: theme.colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: "center" }
});
