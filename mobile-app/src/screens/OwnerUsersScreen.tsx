import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerUsers } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard } from "../components/OwnerCard";
import { StatusPill } from "../components/StatusPill";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type UserRow = Awaited<ReturnType<typeof getOwnerUsers>>["users"][number];

export function OwnerUsersScreen() {
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await getOwnerUsers();
      setUsers(response.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Users failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>Users</Text>
      <OwnerCard title="Read-only mobile view" subtitle="Create users, assign accounts, and reset passwords from the web owner dashboard. Password hashes are never sent to the APK." />
      {loading ? <LoadingState label="Loading users..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {users.map((user) => (
        <OwnerCard key={user.id} title={user.name ?? user.username} subtitle={user.username} badge={user.active ? user.role : "Inactive"}>
          <View style={styles.pills}>
            {user.canPick ? <StatusPill label="Pick" tone="good" /> : null}
            {user.canPack ? <StatusPill label="Pack" tone="good" /> : null}
            {user.canReportProblem ? <StatusPill label="Problems" /> : null}
            {user.mustChangePassword ? <StatusPill label="Must change password" tone="warn" /> : null}
            {user.openPasswordResetRequests ? <StatusPill label={`${user.openPasswordResetRequests} reset request`} tone="warn" /> : null}
          </View>
          <Text style={styles.muted}>
            {user.assignedAccounts.length ? user.assignedAccounts.map((account) => `${account.marketplace}/${account.name}`).join(", ") : "No assigned accounts"}
          </Text>
        </OwnerCard>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: design.spacing.md,
    padding: design.spacing.lg
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.xl,
    fontWeight: design.text.weightBlack
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: design.spacing.sm
  },
  muted: {
    color: design.colors.textMuted,
    fontSize: design.text.sm,
    fontWeight: design.text.weightMedium
  }
});
