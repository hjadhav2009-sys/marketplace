import { useState } from "react";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OwnerCard } from "../components/OwnerCard";
import { WorkerButton } from "../components/WorkerButton";
import { OwnerAccountsScreen } from "./OwnerAccountsScreen";
import { OwnerListingsScreen } from "./OwnerListingsScreen";
import { OwnerReportsScreen } from "./OwnerReportsScreen";
import { OwnerSystemScreen } from "./OwnerSystemScreen";
import { OwnerUsersScreen } from "./OwnerUsersScreen";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type AdminView = "menu" | "listings" | "reports" | "accounts" | "users" | "system";

export function OwnerAdminScreen({ serverUrl }: { serverUrl: string | null }) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<AdminView>("menu");

  if (view === "listings") {
    return <Nested title="Listings" onBack={() => setView("menu")}><OwnerListingsScreen /></Nested>;
  }
  if (view === "reports") {
    return <Nested title="Reports" onBack={() => setView("menu")}><OwnerReportsScreen /></Nested>;
  }
  if (view === "accounts") {
    return <Nested title="Accounts" onBack={() => setView("menu")}><OwnerAccountsScreen /></Nested>;
  }
  if (view === "users") {
    return <Nested title="Users" onBack={() => setView("menu")}><OwnerUsersScreen /></Nested>;
  }
  if (view === "system") {
    return <Nested title="System" onBack={() => setView("menu")}><OwnerSystemScreen serverUrl={serverUrl} /></Nested>;
  }

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>Admin</Text>
      <OwnerCard title="Listings" subtitle="Listing master status, missing images, and recent SKU cards." onPress={() => setView("listings")} />
      <OwnerCard title="Reports" subtitle="Daily summary, old pending, problems, missing listing/image counts." onPress={() => setView("reports")} />
      <OwnerCard title="Accounts" subtitle="Company, marketplace groups, seller accounts, users, orders, listings." onPress={() => setView("accounts")} />
      <OwnerCard title="Users" subtitle="Roles, picker/packer permissions, assigned accounts, reset request status." onPress={() => setView("users")} />
      <OwnerCard title="System" subtitle="Server URL, API status, local-only and Tailscale notes." onPress={() => setView("system")} />
    </ScrollView>
  );
}

function Nested({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <>
      <ScrollView contentContainerStyle={styles.nestedHeader}>
        <Text style={styles.title}>{title}</Text>
        <WorkerButton onPress={onBack} variant="secondary">Back to Admin</WorkerButton>
      </ScrollView>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: design.spacing.md,
    padding: design.spacing.lg
  },
  nestedHeader: {
    gap: design.spacing.sm,
    padding: design.spacing.lg,
    paddingBottom: 0
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.xl,
    fontWeight: design.text.weightBlack
  }
});
