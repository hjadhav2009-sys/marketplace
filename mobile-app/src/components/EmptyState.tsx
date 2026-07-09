import { StyleSheet, Text, View } from "react-native";
import { webMobileDesign as design } from "../theme/webMobileDesign";
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
    ...design.card,
    gap: design.spacing.sm,
    padding: design.spacing.xl
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.lg,
    fontWeight: design.text.weightBlack
  },
  message: {
    color: design.colors.textMuted,
    fontSize: design.text.base,
    lineHeight: 21
  }
});
