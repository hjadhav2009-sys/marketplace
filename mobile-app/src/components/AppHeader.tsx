import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MobileUser } from "../types/mobile";
import { webMobileDesign as design } from "../theme/webMobileDesign";

export function AppHeader({ user, accountLabel }: { user: MobileUser; accountLabel: string }) {
  const insets = useSafeAreaInsets();
  const marketplace = user.selectedAccount?.marketplace ?? user.accounts[0]?.marketplace ?? "Marketplace";

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]} testID="app-header-safe-area">
      <View style={styles.headerText}>
        <Text style={styles.brand}>Marketplace Pick & Pack</Text>
        <Text numberOfLines={1} style={styles.title}>{user.selectedAccount?.companyName ?? "Company"} / {accountLabel}</Text>
        <Text numberOfLines={1} style={styles.context}>{marketplace} / {user.role}</Text>
      </View>
      <Text style={styles.role}>{user.role}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: design.colors.surface,
    borderBottomColor: design.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: design.spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: design.spacing.lg,
    paddingVertical: 10
  },
  headerText: {
    flex: 1
  },
  brand: {
    color: design.colors.berry,
    fontSize: design.text.tiny,
    fontWeight: design.text.weightBlack,
    textTransform: "uppercase"
  },
  title: {
    color: design.colors.text,
    fontSize: 16,
    fontWeight: design.text.weightBlack
  },
  context: {
    color: design.colors.textMuted,
    fontSize: design.text.sm,
    fontWeight: design.text.weightMedium
  },
  role: {
    backgroundColor: design.colors.surfaceMuted,
    borderRadius: design.radius.pill,
    color: design.colors.textSubtle,
    fontSize: design.text.tiny,
    fontWeight: design.text.weightBlack,
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
