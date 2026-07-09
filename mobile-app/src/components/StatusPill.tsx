import { StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../theme/mobileTheme";

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
    borderRadius: mobileTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  neutral: {
    backgroundColor: mobileTheme.colors.border
  },
  good: {
    backgroundColor: mobileTheme.colors.success
  },
  warn: {
    backgroundColor: mobileTheme.colors.warning
  },
  bad: {
    backgroundColor: mobileTheme.colors.danger
  },
  text: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.tiny,
    fontWeight: "800"
  }
});
