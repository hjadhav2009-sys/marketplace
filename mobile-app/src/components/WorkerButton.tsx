import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { mobileTheme } from "../theme/mobileTheme";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function WorkerButton({ children, onPress, variant = "primary", disabled, loading, style }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        pressed && !disabled ? styles.pressed : null,
        style
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "secondary" || variant === "ghost" ? "#0f172a" : "#ffffff"} /> : null}
      <Text style={[styles.text, (variant === "secondary" || variant === "ghost") && styles.darkText]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: mobileTheme.radius.md,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primary: {
    backgroundColor: mobileTheme.colors.primary
  },
  secondary: {
    backgroundColor: mobileTheme.colors.border
  },
  danger: {
    backgroundColor: mobileTheme.colors.dangerStrong
  },
  ghost: {
    backgroundColor: "transparent"
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    transform: [{ scale: 0.98 }]
  },
  text: {
    color: "#ffffff",
    fontSize: mobileTheme.font.md,
    fontWeight: "800"
  },
  darkText: {
    color: mobileTheme.colors.text
  }
});
