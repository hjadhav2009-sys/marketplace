import { StyleSheet, Text, View } from "react-native";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

export function NativeErrorState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff1f2", borderColor: "#fecdd3", borderRadius: theme.radius, borderWidth: 1, padding: 14 },
  title: { color: theme.colors.danger, fontSize: 16, fontWeight: "800" },
  message: { color: "#9f1239", fontSize: 14, lineHeight: 20, marginTop: 4 }
});
