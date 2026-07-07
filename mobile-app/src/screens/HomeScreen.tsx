import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { MobileUser } from "../types/mobile";
import { AccountScreen } from "./AccountScreen";
import { PickerScreen } from "./PickerScreen";
import { PackingScreen } from "./PackingScreen";

type Props = {
  user: MobileUser;
  accountLabel: string;
  serverUrl: string | null;
  onLogout: () => void;
  onChangeServer: () => void;
  onUserRefresh: (user: MobileUser | null) => void;
};

type Tab = "picker" | "packing" | "account";

export function HomeScreen({ user, accountLabel, serverUrl, onLogout, onChangeServer, onUserRefresh }: Props) {
  const tabs = useMemo(() => {
    const available: Tab[] = [];

    if (user.role === "OWNER" || user.role === "PICKER") {
      available.push("picker");
    }

    if (user.role === "OWNER" || user.role === "PACKER") {
      available.push("packing");
    }

    available.push("account");
    return available;
  }, [user.role]);
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0] ?? "account");

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>Marketplace</Text>
          <Text numberOfLines={1} style={styles.context}>{accountLabel}</Text>
        </View>
        <Text style={styles.role}>{user.role}</Text>
      </View>
      <View style={styles.content}>
        {activeTab === "picker" ? <PickerScreen user={user} /> : null}
        {activeTab === "packing" ? <PackingScreen user={user} /> : null}
        {activeTab === "account" ? (
          <AccountScreen
            user={user}
            serverUrl={serverUrl}
            onLogout={onLogout}
            onChangeServer={onChangeServer}
            onUserRefresh={onUserRefresh}
          />
        ) : null}
      </View>
      <View style={styles.nav}>
        {tabs.map((tab) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.navItem, activeTab === tab && styles.navActive]}>
            <Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>{tab === "packing" ? "Pack" : tab[0].toUpperCase() + tab.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1
  },
  header: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#e2e8f0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  headerText: {
    flex: 1
  },
  brand: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  context: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  role: {
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  content: {
    flex: 1
  },
  nav: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10
  },
  navItem: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    minHeight: 52,
    justifyContent: "center"
  },
  navActive: {
    backgroundColor: "#0f172a"
  },
  navText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "900"
  },
  navTextActive: {
    color: "#ffffff"
  }
});
