import * as Linking from "expo-linking";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OfflineReason } from "../app/AppState";
import { ConnectionStatusCard } from "../components/ConnectionStatusCard";
import { NativeButton } from "../components/NativeButton";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

const messages: Record<OfflineReason, string> = {
  offline: "This phone has no active network connection.",
  timeout: "The owner PC did not respond in time. Check that the server and Tailscale are running.",
  dns: "The server address could not be reached. Check the saved URL and network.",
  server: "The server responded with an error. Retry after checking the owner PC.",
  webview: "The web application could not load. Retry without changing your saved server."
};

type Props = { reason: OfflineReason; serverUrl: string; onRetry: () => void; onChangeServer: () => void };

export function OfflineScreen({ reason, serverUrl, onRetry, onChangeServer }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <Text style={styles.eyebrow}>Connection</Text>
      <Text style={styles.title}>Owner PC/server is unavailable</Text>
      <Text style={styles.copy}>{messages[reason]}</Text>
      <ConnectionStatusCard connected={false} serverUrl={serverUrl} />
      <NativeButton onPress={onRetry}>Retry connection</NativeButton>
      <NativeButton onPress={onChangeServer} variant="secondary">Change server</NativeButton>
      <NativeButton onPress={async () => { await Linking.openURL("tailscale://").catch(async () => { await Linking.openURL("https://tailscale.com/download"); }); }} variant="secondary">Open Tailscale</NativeButton>
      <Text style={styles.help}>For warehouse use, run the production Next.js server on the owner PC and keep the PC awake.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.colors.background, flexGrow: 1, gap: 14, justifyContent: "center", paddingHorizontal: 20 },
  eyebrow: { color: theme.colors.danger, fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  title: { color: theme.colors.text, fontSize: 27, fontWeight: "900" },
  copy: { color: theme.colors.muted, fontSize: 16, lineHeight: 23 },
  help: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }
});
