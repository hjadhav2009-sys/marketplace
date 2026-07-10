import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeButton } from "../components/NativeButton";
import { UpdateCard } from "../components/UpdateCard";
import { openTrustedDownload } from "../services/downloadService";
import { getCurrentVersion, type AppUpdateMetadata } from "../services/updateService";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

type Props = { update: AppUpdateMetadata; serverUrl: string; mandatory: boolean; onLater: () => void; onChangeServer: () => void };

export function AppUpdateScreen({ update, serverUrl, mandatory, onLater, onChangeServer }: Props) {
  const insets = useSafeAreaInsets();
  const current = getCurrentVersion();
  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <Text style={styles.eyebrow}>{mandatory ? "Update required" : "Recommended update"}</Text>
      <Text style={styles.title}>Marketplace Pick & Pack</Text>
      <Text style={styles.copy}>Installed {current.versionName} ({current.versionCode})</Text>
      <UpdateCard update={update} />
      <NativeButton disabled={!update.downloadUrl} onPress={() => update.downloadUrl ? openTrustedDownload(update.downloadUrl, serverUrl) : undefined}>Download update</NativeButton>
      {!mandatory ? <NativeButton onPress={onLater} variant="secondary">Later</NativeButton> : null}
      <NativeButton onPress={onChangeServer} variant="secondary">Change server</NativeButton>
      <Text style={styles.help}>Android will show its normal installation confirmation. This app never installs updates silently.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.colors.background, flexGrow: 1, gap: 14, justifyContent: "center", paddingHorizontal: 20 },
  eyebrow: { color: theme.colors.primary, fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  title: { color: theme.colors.text, fontSize: 27, fontWeight: "900" },
  copy: { color: theme.colors.muted, fontSize: 15 },
  help: { color: theme.colors.muted, fontSize: 13, lineHeight: 19 }
});
