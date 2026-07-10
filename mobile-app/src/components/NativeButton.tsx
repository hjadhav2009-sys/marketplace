import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

type Props = {
  children: ReactNode;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger";
};

export function NativeButton({ children, onPress, disabled, loading, variant = "primary" }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={variant === "secondary" ? theme.colors.text : "#ffffff"} /> : <Text style={[styles.label, variant === "secondary" && styles.secondaryLabel]}>{children}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderRadius: theme.radius,
    justifyContent: "center",
    minHeight: theme.touchHeight,
    paddingHorizontal: 16
  },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1 },
  danger: { backgroundColor: theme.colors.danger },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
  label: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  secondaryLabel: { color: theme.colors.text }
});
