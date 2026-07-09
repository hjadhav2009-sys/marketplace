import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusPill } from "./StatusPill";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type OwnerCardProps = {
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  children?: ReactNode;
  onPress?: () => void;
};

export function OwnerCard({ title, subtitle, badge, children, onPress }: OwnerCardProps) {
  const content = (
    <>
      <View style={styles.head}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {badge ? <StatusPill label={badge} tone="good" /> : null}
      </View>
      {children ? <View style={styles.body}>{children}</View> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.card}>{content}</View>;
}

export function OwnerMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...design.card,
    gap: design.spacing.sm,
    padding: design.spacing.xl
  },
  pressed: {
    opacity: 0.82
  },
  head: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: design.spacing.sm,
    justifyContent: "space-between"
  },
  titleWrap: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.lg,
    fontWeight: design.text.weightBlack
  },
  subtitle: {
    color: design.colors.textMuted,
    fontSize: design.text.base,
    fontWeight: design.text.weightMedium,
    lineHeight: 20,
    marginTop: 2
  },
  body: {
    gap: design.spacing.sm
  },
  metric: {
    backgroundColor: design.colors.surfaceMuted,
    borderRadius: design.radius.md,
    flex: 1,
    minWidth: "45%",
    padding: design.spacing.md
  },
  metricValue: {
    color: design.colors.text,
    fontSize: design.text.xl,
    fontWeight: design.text.weightBlack
  },
  metricLabel: {
    color: design.colors.textMuted,
    fontSize: design.text.sm,
    fontWeight: design.text.weightBold,
    marginTop: 2
  }
});
