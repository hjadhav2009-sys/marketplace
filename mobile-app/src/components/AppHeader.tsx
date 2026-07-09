import { StyleSheet, Text, View } from "react-native";
import type { MobileUser } from "../types/mobile";
import { mobileTheme } from "../theme/mobileTheme";

export function AppHeader({ user, accountLabel }: { user: MobileUser; accountLabel: string }) {
  const marketplace = user.selectedAccount?.marketplace ?? user.accounts[0]?.marketplace ?? "Marketplace";

  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.brand}>{user.selectedAccount?.companyName ?? "Marketplace"}</Text>
        <Text numberOfLines={1} style={styles.context}>{marketplace} / {accountLabel}</Text>
      </View>
      <Text style={styles.role}>{user.role}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: mobileTheme.spacing.md,
    justifyContent: "space-between",
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: 10
  },
  headerText: {
    flex: 1
  },
  brand: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.lg,
    fontWeight: "900"
  },
  context: {
    color: mobileTheme.colors.textMuted,
    fontSize: mobileTheme.font.tiny,
    fontWeight: "700"
  },
  role: {
    backgroundColor: mobileTheme.colors.primarySoft,
    borderRadius: mobileTheme.radius.pill,
    color: mobileTheme.colors.primaryText,
    fontSize: mobileTheme.font.tiny,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 5
  }
});
