import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color="#0f172a" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 12,
    justifyContent: "center",
    padding: 24
  },
  text: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "700"
  }
});
