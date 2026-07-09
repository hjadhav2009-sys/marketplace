import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { webMobileDesign as design } from "../theme/webMobileDesign";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={design.colors.primary} />
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
    color: design.colors.textSubtle,
    fontSize: 15,
    fontWeight: design.text.weightMedium
  }
});
