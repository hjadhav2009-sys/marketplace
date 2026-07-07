import { StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad";
};

export function StatusPill({ label, tone = "neutral" }: Props) {
  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  neutral: {
    backgroundColor: "#e2e8f0"
  },
  good: {
    backgroundColor: "#dcfce7"
  },
  warn: {
    backgroundColor: "#fef3c7"
  },
  bad: {
    backgroundColor: "#fee2e2"
  },
  text: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  }
});
