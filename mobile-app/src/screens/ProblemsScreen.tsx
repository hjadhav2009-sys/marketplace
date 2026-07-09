import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getProblems } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard } from "../components/OwnerCard";
import { StatusPill } from "../components/StatusPill";
import { WorkerButton } from "../components/WorkerButton";
import type { MobileProblemRow } from "../types/mobile";
import { webMobileDesign as design } from "../theme/webMobileDesign";

export function ProblemsScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [problems, setProblems] = useState<MobileProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextStatus = status) {
    setLoading(true);
    setError(null);
    try {
      const response = await getProblems(nextStatus);
      setProblems(response.problems);
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Problems failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("OPEN");
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>Problems</Text>
        <View style={styles.filters}>
          <WorkerButton onPress={() => load("OPEN")} variant={status === "OPEN" ? "primary" : "secondary"} style={styles.filter}>Open</WorkerButton>
          <WorkerButton onPress={() => load("RESOLVED")} variant={status === "RESOLVED" ? "primary" : "secondary"} style={styles.filter}>Resolved</WorkerButton>
        </View>
      </View>
      {loading ? <LoadingState label="Loading problems..." /> : null}
      {error ? <ErrorState message={error} onRetry={() => load(status)} /> : null}
      {!loading && !error && problems.length === 0 ? <OwnerCard title="No problems" subtitle={`No ${status.toLowerCase()} problems for this account.`} /> : null}
      {problems.map((problem) => (
        <OwnerCard key={problem.id} title={problem.order.sku} subtitle={problem.reason} badge={problem.status}>
          <View style={styles.row}>
            <View style={styles.imageBox}>
              {problem.order.mainImageUrl ? <Image source={{ uri: problem.order.mainImageUrl }} resizeMode="contain" style={styles.image} /> : <Text style={styles.noImage}>No image</Text>}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.copy}>{problem.order.title ?? "Untitled product"}</Text>
              <View style={styles.pills}>
                <StatusPill label={`Qty ${problem.order.qty}`} />
                <StatusPill label={problem.order.packStatus} />
                <StatusPill label={problem.order.pickStatus} />
              </View>
              {problem.reporter ? <Text style={styles.muted}>Reported by {problem.reporter}</Text> : null}
            </View>
          </View>
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
  head: {
    gap: design.spacing.sm
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.xl,
    fontWeight: design.text.weightBlack
  },
  filters: {
    flexDirection: "row",
    gap: design.spacing.sm
  },
  filter: {
    flex: 1,
    minHeight: design.sizes.compactButtonHeight
  },
  row: {
    flexDirection: "row",
    gap: design.spacing.md
  },
  imageBox: {
    ...design.imageSquare,
    borderRadius: design.radius.md,
    width: 82
  },
  image: {
    height: "90%",
    width: "90%"
  },
  noImage: {
    color: design.colors.textMuted,
    fontSize: design.text.sm,
    fontWeight: design.text.weightBold
  },
  rowText: {
    flex: 1,
    gap: design.spacing.sm
  },
  copy: {
    color: design.colors.textSubtle,
    fontSize: design.text.base,
    fontWeight: design.text.weightBold
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: design.spacing.xs
  },
  muted: {
    color: design.colors.textMuted,
    fontSize: design.text.sm
  }
});
