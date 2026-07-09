import { StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../theme/mobileTheme";

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...mobileTheme.card,
    flex: 1,
    minWidth: "45%",
    padding: mobileTheme.spacing.md
  },
  value: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.xl,
    fontWeight: "900"
  },
  label: {
    color: mobileTheme.colors.textMuted,
    fontSize: mobileTheme.font.sm,
    fontWeight: "800",
    marginTop: 2
  }
});
