import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileTab } from "../types/mobile";
import { mobileTheme } from "../theme/mobileTheme";

const labels: Record<MobileTab, string> = {
  dashboard: "Home",
  picker: "Picker",
  packing: "Pack",
  problems: "Problems",
  imports: "Imports",
  reports: "Reports",
  admin: "Admin",
  account: "Account"
};

export function BottomNav({ tabs, activeTab, onChange }: { tabs: MobileTab[]; activeTab: MobileTab; onChange: (tab: MobileTab) => void }) {
  return (
    <View style={styles.nav}>
      {tabs.map((tab) => (
        <Pressable key={tab} onPress={() => onChange(tab)} style={[styles.navItem, activeTab === tab && styles.navActive]}>
          <Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>{labels[tab]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    backgroundColor: mobileTheme.colors.surface,
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: mobileTheme.spacing.sm,
    padding: 10
  },
  navItem: {
    alignItems: "center",
    borderRadius: mobileTheme.radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 4
  },
  navActive: {
    backgroundColor: mobileTheme.colors.primary
  },
  navText: {
    color: mobileTheme.colors.textSubtle,
    fontSize: mobileTheme.font.tiny,
    fontWeight: "900"
  },
  navTextActive: {
    color: "#ffffff"
  }
});
