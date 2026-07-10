import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectionStatusCard } from "../components/ConnectionStatusCard";
import { NativeButton } from "../components/NativeButton";
import { getCurrentVersion } from "../services/updateService";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

type Props = {
  serverUrl: string;
  onClose: () => void;
  onChangeServer: () => void;
  onCheckUpdate: () => void;
  onClearSession: () => void;
  onClearCache: () => void;
  onOpenHome: () => void;
  onScannerTest: () => void;
};

export function NativeSettingsScreen(props: Props) {
  const insets = useSafeAreaInsets();
  const version = getCurrentVersion();
  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
      <Text style={styles.eyebrow}>Android shell</Text>
      <Text style={styles.title}>Native settings</Text>
      <Text style={styles.copy}>Version {version.versionName} ({version.versionCode})</Text>
      <ConnectionStatusCard connected serverUrl={props.serverUrl} />
      <NativeButton onPress={props.onOpenHome}>Open web home</NativeButton>
      <NativeButton onPress={props.onScannerTest} variant="secondary">Test scanner</NativeButton>
      <NativeButton onPress={props.onCheckUpdate} variant="secondary">Check for update</NativeButton>
      <NativeButton onPress={props.onClearCache} variant="secondary">Clear web cache</NativeButton>
      <NativeButton onPress={props.onClearSession} variant="secondary">Clear login session</NativeButton>
      <NativeButton onPress={props.onChangeServer} variant="danger">Change server</NativeButton>
      <NativeButton onPress={props.onClose} variant="secondary">Close</NativeButton>
      <Text style={styles.note}>Database files and credentials remain on the owner PC. Use an HTTPS domain or Tailscale for remote access.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.colors.background, flexGrow: 1, gap: 12, paddingHorizontal: 20 },
  eyebrow: { color: theme.colors.primary, fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  title: { color: theme.colors.text, fontSize: 27, fontWeight: "900" },
  copy: { color: theme.colors.muted, fontSize: 14 },
  note: { color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }
});
