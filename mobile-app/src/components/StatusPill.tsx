import { StyleSheet, Text, View } from "react-native";
import { webMobileDesign as design } from "../theme/webMobileDesign";

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
    borderRadius: design.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  neutral: {
    backgroundColor: design.colors.surfaceMuted
  },
  good: {
    backgroundColor: design.colors.success
  },
  warn: {
    backgroundColor: design.colors.warning
  },
  bad: {
    backgroundColor: design.colors.danger
  },
  text: {
    color: design.colors.text,
    fontSize: design.text.tiny,
    fontWeight: design.text.weightBold
  }
});
