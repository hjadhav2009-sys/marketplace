import type { ViewStyle } from "react-native";
import { webMobileDesign } from "./webMobileDesign";

export const mobileTheme = {
  colors: {
    ...webMobileDesign.colors,
    primarySoft: webMobileDesign.colors.berrySoft,
    primaryText: webMobileDesign.colors.berryText
  },
  spacing: webMobileDesign.spacing,
  radius: webMobileDesign.radius,
  font: {
    tiny: webMobileDesign.text.tiny,
    sm: webMobileDesign.text.sm,
    base: webMobileDesign.text.base,
    md: webMobileDesign.text.md,
    lg: webMobileDesign.text.lg,
    xl: webMobileDesign.text.xl,
    hero: webMobileDesign.text.hero
  },
  card: {
    ...webMobileDesign.card
  } satisfies ViewStyle,
  imageSquare: {
    ...webMobileDesign.imageSquare
  } satisfies ViewStyle
};
