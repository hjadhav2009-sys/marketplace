import { StyleSheet, Text, View } from "react-native";
import { mobileTheme } from "../theme/mobileTheme";
import { WorkerButton } from "./WorkerButton";

export function EmptyState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? <WorkerButton onPress={onAction} variant="secondary">{actionLabel}</WorkerButton> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    ...mobileTheme.card,
    gap: mobileTheme.spacing.sm,
    padding: mobileTheme.spacing.lg
  },
  title: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.lg,
    fontWeight: "900"
  },
  message: {
    color: mobileTheme.colors.textMuted,
    fontSize: mobileTheme.font.base,
    lineHeight: 21
  }
});
