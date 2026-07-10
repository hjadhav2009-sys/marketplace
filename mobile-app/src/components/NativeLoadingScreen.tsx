import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

export function NativeLoadingScreen({ message = "Connecting to your warehouse..." }: { message?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <Text style={styles.brand}>Marketplace Pick & Pack</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", backgroundColor: theme.colors.background, flex: 1, justifyContent: "center", padding: 24 },
  brand: { color: theme.colors.text, fontSize: 23, fontWeight: "900", marginTop: 18 },
  message: { color: theme.colors.muted, fontSize: 15, marginTop: 8, textAlign: "center" }
});
