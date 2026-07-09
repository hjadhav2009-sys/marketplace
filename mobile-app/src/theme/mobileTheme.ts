import type { ViewStyle } from "react-native";

export const mobileTheme = {
  colors: {
    background: "#f8fafc",
    surface: "#ffffff",
    surfaceMuted: "#f1f5f9",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#475569",
    primary: "#0f172a",
    primarySoft: "#dbeafe",
    primaryText: "#1d4ed8",
    success: "#dcfce7",
    warning: "#fef3c7",
    danger: "#fee2e2",
    dangerStrong: "#b91c1c"
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    pill: 999
  },
  font: {
    tiny: 12,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 24,
    hero: 28
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1
  } satisfies ViewStyle,
  imageSquare: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    width: "100%"
  } satisfies ViewStyle
};
