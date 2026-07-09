import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getOwnerDashboard } from "../api/mobileApi";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { StatCard } from "../components/StatCard";
import { StatusPill } from "../components/StatusPill";
import { WorkerButton } from "../components/WorkerButton";
import { mobileTheme } from "../theme/mobileTheme";

type DashboardData = Awaited<ReturnType<typeof getOwnerDashboard>>;

export function DashboardScreen({ onOpenPicker, onOpenPacking }: { onOpenPicker: () => void; onOpenPacking: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      setData(await getOwnerDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dashboard failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <LoadingState label="Loading dashboard..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (!data) {
    return <EmptyState title="No dashboard data" message="Refresh after selecting an account." actionLabel="Refresh" onAction={load} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.accountCard}>
        <Text style={styles.kicker}>{data.account.companyName ?? "Company"}</Text>
        <Text style={styles.title}>{data.account.name}</Text>
        <View style={styles.row}>
          <StatusPill label={data.account.marketplace} tone="good" />
          {data.account.code ? <StatusPill label={data.account.code} /> : null}
        </View>
      </View>
      <View style={styles.stats}>
        <StatCard label="Ready today" value={data.stats.todayReady} />
        <StatCard label="Packed today" value={data.stats.packedToday} />
        <StatCard label="Problems" value={data.stats.problemsOpen} />
        <StatCard label="Old pending" value={data.stats.oldPending} />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Latest imports</Text>
        <Text style={styles.meta}>Listing: {data.latestImports.listing?.status ?? "No listing import yet"}</Text>
        <Text style={styles.meta}>Orders: {data.latestImports.orders?.status ?? "No order import yet"}</Text>
      </View>
      <View style={styles.actions}>
        <WorkerButton onPress={onOpenPicker}>Open Picker</WorkerButton>
        <WorkerButton onPress={onOpenPacking} variant="secondary">Open Packing</WorkerButton>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: mobileTheme.spacing.md,
    padding: mobileTheme.spacing.md,
    paddingBottom: mobileTheme.spacing.xxl
  },
  accountCard: {
    ...mobileTheme.card,
    gap: mobileTheme.spacing.sm,
    padding: mobileTheme.spacing.lg
  },
  kicker: {
    color: mobileTheme.colors.primaryText,
    fontSize: mobileTheme.font.sm,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.xl,
    fontWeight: "900"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTheme.spacing.sm
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: mobileTheme.spacing.md
  },
  card: {
    ...mobileTheme.card,
    gap: mobileTheme.spacing.sm,
    padding: mobileTheme.spacing.lg
  },
  sectionTitle: {
    color: mobileTheme.colors.text,
    fontSize: mobileTheme.font.lg,
    fontWeight: "900"
  },
  meta: {
    color: mobileTheme.colors.textMuted,
    fontSize: mobileTheme.font.base,
    fontWeight: "700"
  },
  actions: {
    gap: mobileTheme.spacing.sm
  }
});
