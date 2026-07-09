import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { webMobileDesign as design } from "../theme/webMobileDesign";

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
      {loading ? <ActivityIndicator color={variant === "ghost" ? design.colors.text : "#ffffff"} /> : null}
      <Text style={[styles.text, variant === "ghost" && styles.ghostText]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: design.radius.md,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: design.sizes.buttonHeight,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primary: {
    backgroundColor: design.colors.berry
  },
  secondary: {
    backgroundColor: design.colors.primary
  },
  danger: {
    backgroundColor: design.colors.dangerStrong
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
    fontSize: design.text.md,
    fontWeight: design.text.weightBlack
  },
  ghostText: {
    color: design.colors.text
  }
});
