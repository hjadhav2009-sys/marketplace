import { StyleSheet, Text, View } from "react-native";
import type { AppUpdateMetadata } from "../services/updateService";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

export function UpdateCard({ update }: { update: AppUpdateMetadata }) {
  return (
    <View style={styles.card}>
      <Text style={styles.badge}>{update.mandatory ? "Required update" : "Update available"}</Text>
      <Text style={styles.version}>Version {update.latestVersionName}</Text>
      {update.releaseNotes.slice(0, 5).map((note) => <Text key={note} style={styles.note}>• {note}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius, borderWidth: 1, padding: 16 },
  badge: { color: theme.colors.primary, fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  version: { color: theme.colors.text, fontSize: 20, fontWeight: "900", marginBottom: 8, marginTop: 6 },
  note: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 }
});
