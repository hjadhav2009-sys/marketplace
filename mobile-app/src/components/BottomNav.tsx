import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileTab } from "../types/mobile";
import { webMobileDesign as design } from "../theme/webMobileDesign";

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
    ...design.bottomNav,
    flexDirection: "row",
    gap: design.spacing.sm,
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 8
  },
  navItem: {
    alignItems: "center",
    borderRadius: design.radius.md,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 4
  },
  navActive: {
    backgroundColor: design.colors.primary
  },
  navText: {
    color: design.colors.textSubtle,
    fontSize: design.text.tiny,
    fontWeight: design.text.weightBlack
  },
  navTextActive: {
    color: "#ffffff"
  }
});
