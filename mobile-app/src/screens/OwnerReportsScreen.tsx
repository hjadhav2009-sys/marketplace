import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerReportsSummary } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard, OwnerMetric } from "../components/OwnerCard";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Data = Awaited<ReturnType<typeof getOwnerReportsSummary>>;

export function OwnerReportsScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getOwnerReportsSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reports failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>Reports</Text>
      {loading ? <LoadingState label="Loading report summary..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {data ? (
        <>
          <View style={styles.metrics}>
            <OwnerMetric label="Total orders" value={data.summary.totalOrders} />
            <OwnerMetric label="Ready today" value={data.summary.todayReady} />
            <OwnerMetric label="Packed today" value={data.summary.todayPacked} />
            <OwnerMetric label="Open problems" value={data.summary.openProblems} />
            <OwnerMetric label="Old pending" value={data.summary.oldPending} />
            <OwnerMetric label="Missing listing" value={data.summary.missingListingCurrent} />
            <OwnerMetric label="Missing image" value={data.summary.missingImageCurrent} />
            <OwnerMetric label="Picked today" value={data.summary.todayPicked} />
          </View>
          <OwnerCard title="Top SKUs" subtitle="Current operational SKU summary">
            {data.skuSummary.map((row) => (
              <Text key={row.sku} style={styles.line}>{row.sku}: {row.orders} orders / qty {row.qty}</Text>
            ))}
          </OwnerCard>
          <OwnerCard title="Courier summary" subtitle="Compact packing split">
            {data.courierSummary.map((row) => (
              <Text key={row.courier} style={styles.line}>{row.courier}: {row.orders} orders / qty {row.qty}</Text>
            ))}
          </OwnerCard>
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
  line: {
    color: design.colors.textSubtle,
    fontSize: design.text.base,
    fontWeight: design.text.weightBold
  }
});
