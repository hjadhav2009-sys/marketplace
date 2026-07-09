import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { MobileTab, MobileUser } from "../types/mobile";
import { AccountScreen } from "./AccountScreen";
import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { DashboardScreen } from "./DashboardScreen";
import { PickerScreen } from "./PickerScreen";
import { PackingScreen } from "./PackingScreen";
import { EmptyState } from "../components/EmptyState";
import { WorkerButton } from "../components/WorkerButton";
import { mobileTheme } from "../theme/mobileTheme";

type Props = {
  user: MobileUser;
  accountLabel: string;
  serverUrl: string | null;
  onLogout: () => void;
  onChangeServer: () => void;
  onUserRefresh: (user: MobileUser | null) => void;
};

export function HomeScreen({ user, accountLabel, serverUrl, onLogout, onChangeServer, onUserRefresh }: Props) {
  const tabs = useMemo(() => {
    const preferred = user.tabs.length > 0 ? user.tabs : ["account" as MobileTab];
    return preferred.length > 5 && user.role === "OWNER" ? ["dashboard", "picker", "packing", "admin", "account"] as MobileTab[] : preferred;
  }, [user.role, user.tabs]);
  const [activeTab, setActiveTab] = useState<MobileTab>(tabs[0] ?? "account");

  return (
    <View style={styles.wrap}>
      <AppHeader user={user} accountLabel={accountLabel} />
      <View style={styles.content}>
        {activeTab === "dashboard" ? <DashboardScreen onOpenPicker={() => setActiveTab("picker")} onOpenPacking={() => setActiveTab("packing")} /> : null}
        {activeTab === "picker" ? <PickerScreen user={user} /> : null}
        {activeTab === "packing" ? <PackingScreen user={user} /> : null}
        {activeTab === "problems" ? <ComingSoon title="Problems" message="Problem review is available in the web dashboard for this APK version." /> : null}
        {activeTab === "imports" ? <ComingSoon title="Imports" message="Large Excel imports stay on the web owner dashboard in this APK version." /> : null}
        {activeTab === "reports" ? <ComingSoon title="Reports" message="Reports are available in the web dashboard while mobile reports are being expanded." /> : null}
        {activeTab === "admin" ? <OwnerAdminMenu onAccount={() => setActiveTab("account")} /> : null}
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
      <BottomNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
    </View>
  );
}

function ComingSoon({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.panel}>
      <EmptyState title={title} message={message} />
    </View>
  );
}

function OwnerAdminMenu({ onAccount }: { onAccount: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.adminMenu}>
      <Text style={styles.adminTitle}>Admin</Text>
      <AdminCard title="Listings / SKU Images" body="Use web dashboard for listing import and large image review in this APK version." />
      <AdminCard title="Accounts" body="Switch and manage seller accounts from web. Mobile account info is available in Account." />
      <AdminCard title="Users" body="Create users and reset passwords from web. Mobile password-change support is active." />
      <AdminCard title="System / Sync" body="Server URL and connection test are in Account." />
      <WorkerButton onPress={onAccount} variant="secondary">Open Account</WorkerButton>
    </ScrollView>
  );
}

function AdminCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.adminCard}>
      <Text style={styles.adminCardTitle}>{title}</Text>
      <Text style={styles.adminCardBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1
  },
  content: {
    flex: 1
  },
  panel: {
    padding: mobileTheme.spacing.md
  },
  adminMenu: {
    gap: mobileTheme.spacing.md,
    padding: mobileTheme.spacing.md,
    paddingBottom: mobileTheme.spacing.xxl
  },
  adminTitle: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.xl,
    fontWeight: "900"
  },
  adminCard: {
    ...mobileTheme.card,
    gap: mobileTheme.spacing.xs,
    padding: mobileTheme.spacing.lg
  },
  adminCardTitle: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.lg,
    fontWeight: "900"
  },
  adminCardBody: {
    color: mobileTheme.colors.textMuted,
    fontSize: mobileTheme.font.base,
    lineHeight: 21
  }
});
