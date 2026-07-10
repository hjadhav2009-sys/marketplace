import { StyleSheet, Text, View } from "react-native";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

export function ConnectionStatusCard({ serverUrl, connected }: { serverUrl: string; connected: boolean }) {
  return (
    <View style={styles.card}>
      <View style={[styles.dot, { backgroundColor: connected ? theme.colors.success : theme.colors.danger }]} />
      <View style={styles.copy}>
        <Text style={styles.label}>{connected ? "Connected" : "Server unavailable"}</Text>
        <Text numberOfLines={1} style={styles.url}>{serverUrl}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius, borderWidth: 1, flexDirection: "row", padding: 14 },
  dot: { borderRadius: 6, height: 12, marginRight: 10, width: 12 },
  copy: { flex: 1 },
  label: { color: theme.colors.text, fontSize: 15, fontWeight: "800" },
  url: { color: theme.colors.muted, fontSize: 13, marginTop: 2 }
});
