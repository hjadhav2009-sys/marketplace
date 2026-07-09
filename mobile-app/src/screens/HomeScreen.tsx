import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import type { MobileTab, MobileUser } from "../types/mobile";
import { AccountScreen } from "./AccountScreen";
import { AppHeader } from "../components/AppHeader";
import { BottomNav } from "../components/BottomNav";
import { DashboardScreen } from "./DashboardScreen";
import { PickerScreen } from "./PickerScreen";
import { PackingScreen } from "./PackingScreen";
import { OwnerAdminScreen } from "./OwnerAdminScreen";
import { OwnerImportsScreen } from "./OwnerImportsScreen";
import { OwnerOldPendingScreen } from "./OwnerOldPendingScreen";
import { ProblemsScreen } from "./ProblemsScreen";
import { WorkScreen } from "./WorkScreen";
import { EmptyState } from "../components/EmptyState";
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
    return user.tabs.length > 0 ? user.tabs : ["account" as MobileTab];
  }, [user.tabs]);
  const [activeTab, setActiveTab] = useState<MobileTab | "oldPending">(tabs[0] ?? "account");
  const navActiveTab = tabs.includes(activeTab as MobileTab)
    ? activeTab as MobileTab
    : ["picker", "packing", "problems", "oldPending"].includes(activeTab)
      ? "work"
      : "admin";

  return (
    <View style={styles.wrap}>
      <AppHeader user={user} accountLabel={accountLabel} />
      <View style={styles.content}>
        {activeTab === "dashboard" ? (
          <DashboardScreen
            onOpenPicker={() => setActiveTab("picker")}
            onOpenPacking={() => setActiveTab("packing")}
            onOpenImports={() => setActiveTab("imports")}
            onOpenReports={() => setActiveTab("admin")}
            onOpenUsers={() => setActiveTab("admin")}
          />
        ) : null}
        {activeTab === "work" ? (
          <WorkScreen
            user={user}
            onOpenPicker={() => setActiveTab("picker")}
            onOpenPacking={() => setActiveTab("packing")}
            onOpenProblems={() => setActiveTab("problems")}
            onOpenOldPending={() => setActiveTab("oldPending")}
          />
        ) : null}
        {activeTab === "picker" ? <PickerScreen user={user} /> : null}
        {activeTab === "packing" ? <PackingScreen user={user} /> : null}
        {activeTab === "problems" ? <ProblemsScreen /> : null}
        {activeTab === "oldPending" ? <OwnerOldPendingScreen /> : null}
        {activeTab === "imports" ? <OwnerImportsScreen /> : null}
        {activeTab === "reports" ? <ComingSoon title="Reports" message="Reports are available in the web dashboard while mobile reports are being expanded." /> : null}
        {activeTab === "admin" ? <OwnerAdminScreen serverUrl={serverUrl} /> : null}
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
      <BottomNav tabs={tabs} activeTab={navActiveTab} onChange={setActiveTab} />
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

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: mobileTheme.colors.background,
    flex: 1
  },
  content: {
    flex: 1
  },
  panel: {
    padding: mobileTheme.spacing.md
  }
});
