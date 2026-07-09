import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerOldPending } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard, OwnerMetric } from "../components/OwnerCard";
import { StatusPill } from "../components/StatusPill";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Data = Awaited<ReturnType<typeof getOwnerOldPending>>;

export function OwnerOldPendingScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getOwnerOldPending());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Old pending failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>Old Pending</Text>
      <OwnerCard title="Review queue" subtitle="Old pending orders remain in history and reports. Review them separately so today's work stays clean." />
      {loading ? <LoadingState label="Loading old pending..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {data ? (
        <>
          <View style={styles.metrics}>
            <OwnerMetric label="Total" value={data.total} />
            {data.statusGroups.map((group) => <OwnerMetric key={group.status} label={group.status} value={group.count} />)}
          </View>
          {data.orders.map((order) => (
            <OwnerCard key={order.id} title={order.sku} subtitle={`Qty ${order.qty}`} badge={order.oldPendingReviewStatus}>
              <View style={styles.pills}>
                <StatusPill label={order.marketplace} />
                <StatusPill label={order.pickStatus} />
                <StatusPill label={order.packStatus} />
              </View>
              <Text style={styles.muted}>Tracking/AWB stored. Use web owner page for review actions.</Text>
            </OwnerCard>
          ))}
        </>
      ) : null}
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
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: design.spacing.sm
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
