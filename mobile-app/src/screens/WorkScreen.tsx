import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerDashboard } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard, OwnerMetric } from "../components/OwnerCard";
import { WorkerButton } from "../components/WorkerButton";
import type { MobileUser } from "../types/mobile";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Props = {
  user: MobileUser;
  onOpenPicker: () => void;
  onOpenPacking: () => void;
  onOpenProblems: () => void;
  onOpenOldPending: () => void;
};

type DashboardData = Awaited<ReturnType<typeof getOwnerDashboard>>;

export function WorkScreen({ user, onOpenPicker, onOpenPacking, onOpenProblems, onOpenOldPending }: Props) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(user.role === "OWNER");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (user.role !== "OWNER") {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setData(await getOwnerDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Work summary failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>Work</Text>
      {loading ? <LoadingState label="Loading work summary..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {data ? (
        <View style={styles.metrics}>
          <OwnerMetric label="Ready today" value={data.stats.todayReady} />
          <OwnerMetric label="Packed today" value={data.stats.packedToday} />
          <OwnerMetric label="Problems" value={data.stats.problemsOpen} />
          <OwnerMetric label="Old pending" value={data.stats.oldPending} />
        </View>
      ) : null}
      {user.permissions.canPick ? (
        <OwnerCard title="Picker" subtitle="Open one-column product cards and mark picked items." badge="Pick">
          <WorkerButton onPress={onOpenPicker}>Open Picker</WorkerButton>
        </OwnerCard>
      ) : null}
      {user.permissions.canPack ? (
        <OwnerCard title="Packing" subtitle="Find by Tracking ID / AWB, scan barcode, and pack ready items." badge="Pack">
          <WorkerButton onPress={onOpenPacking}>Open Packing</WorkerButton>
        </OwnerCard>
      ) : null}
      {user.permissions.canViewAssignedProblems ? (
        <OwnerCard title="Problems" subtitle="Review open problem orders for this account.">
          <WorkerButton onPress={onOpenProblems} variant="secondary">Open Problems</WorkerButton>
        </OwnerCard>
      ) : null}
      {user.permissions.canReviewOldPending ? (
        <OwnerCard title="Old Pending" subtitle="Review older pending orders separately so today stays clean.">
          <WorkerButton onPress={onOpenOldPending} variant="secondary">Open Old Pending</WorkerButton>
        </OwnerCard>
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
  }
});
