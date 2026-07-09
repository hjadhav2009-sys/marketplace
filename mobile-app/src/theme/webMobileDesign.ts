import type { ViewStyle } from "react-native";

export const webMobileDesign = {
  colors: {
    background: "#fafaf9",
    surface: "#ffffff",
    surfaceMuted: "#f8fafc",
    border: "#e2e8f0",
    borderStrong: "#cbd5e1",
    text: "#0f172a",
    textMuted: "#64748b",
    textSubtle: "#475569",
    primary: "#0f172a",
    primaryHover: "#1e293b",
    primaryText: "#ffffff",
    berry: "#be185d",
    berrySoft: "#fce7f3",
    berryText: "#be185d",
    mint: "#0f766e",
    success: "#dcfce7",
    successText: "#166534",
    warning: "#fef3c7",
    warningText: "#92400e",
    danger: "#fee2e2",
    dangerStrong: "#b91c1c",
    dangerText: "#991b1b",
    overlay: "rgba(15,23,42,0.95)",
    overlaySoft: "rgba(15,23,42,0.45)"
  },
  text: {
    tiny: 11,
    sm: 12,
    base: 14,
    md: 15,
    lg: 18,
    xl: 24,
    hero: 28,
    weightMedium: "700" as const,
    weightBold: "800" as const,
    weightBlack: "900" as const
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 14,
    xl: 16,
    xxl: 24
  },
  radius: {
    sm: 8,
    md: 10,
    lg: 14,
    xl: 18,
    sheet: 22,
    pill: 999
  },
  sizes: {
    buttonHeight: 48,
    compactButtonHeight: 42,
    inputHeight: 52,
    bottomNavHeight: 66,
    thumbnail: 64
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    borderWidth: 1
  } satisfies ViewStyle,
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  } satisfies ViewStyle,
  imageSquare: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    width: "100%"
  } satisfies ViewStyle,
  bottomNav: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1
  } satisfies ViewStyle
};
