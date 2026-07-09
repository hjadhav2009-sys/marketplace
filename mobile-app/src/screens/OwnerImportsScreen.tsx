import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerImports } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard, OwnerMetric } from "../components/OwnerCard";
import { StatusPill } from "../components/StatusPill";
import { WorkerButton } from "../components/WorkerButton";
import type { MobileOwnerImportJob } from "../types/mobile";
import { webMobileDesign as design } from "../theme/webMobileDesign";

export function OwnerImportsScreen() {
  const insets = useSafeAreaInsets();
  const [jobs, setJobs] = useState<MobileOwnerImportJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const response = await getOwnerImports(nextPage, 10);
      setJobs(response.jobs);
      setTotal(response.total);
      setPage(response.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Imports failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / 10));

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>Imports</Text>
        <WorkerButton onPress={() => load(page)} variant="secondary" style={styles.refresh}>Refresh</WorkerButton>
      </View>
      <OwnerCard title="Large Excel uploads" subtitle="Use the web dashboard for large Flipkart Excel uploads. APK shows progress and issues as mobile cards." />
      {loading ? <LoadingState label="Loading import jobs..." /> : null}
      {error ? <ErrorState message={error} onRetry={() => load(page)} /> : null}
      {jobs.map((job) => {
        const progress = job.totalRows ? Math.round((job.processedRows / job.totalRows) * 100) : 0;
        return (
          <OwnerCard key={job.id} title={job.importType} subtitle={job.fileName} badge={job.status}>
            <View style={styles.metrics}>
              <OwnerMetric label="Progress" value={`${progress}%`} />
              <OwnerMetric label="Rows" value={`${job.processedRows}/${job.totalRows}`} />
              <OwnerMetric label="Created" value={job.createdRows} />
              <OwnerMetric label="Errors" value={job.errorRows} />
            </View>
            <View style={styles.pills}>
              <StatusPill label={`Updated ${job.updatedRows}`} />
              <StatusPill label={`Dup ${job.duplicateRows}`} tone={job.duplicateRows ? "warn" : "neutral"} />
              <StatusPill label={`Missing listing ${job.missingListingRows}`} tone={job.missingListingRows ? "warn" : "neutral"} />
              <StatusPill label={`Missing image ${job.missingImageRows}`} tone={job.missingImageRows ? "warn" : "neutral"} />
            </View>
          </OwnerCard>
        );
      })}
      <View style={styles.pager}>
        <WorkerButton onPress={() => load(Math.max(1, page - 1))} variant="secondary" disabled={page <= 1}>Previous</WorkerButton>
        <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
        <WorkerButton onPress={() => load(Math.min(totalPages, page + 1))} variant="secondary" disabled={page >= totalPages}>Next</WorkerButton>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: design.spacing.md,
    padding: design.spacing.lg
  },
  head: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.xl,
    fontWeight: design.text.weightBlack
  },
  refresh: {
    minHeight: design.sizes.compactButtonHeight
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
  pager: {
    alignItems: "center",
    flexDirection: "row",
    gap: design.spacing.sm,
    justifyContent: "space-between"
  },
  pageText: {
    color: design.colors.textMuted,
    fontWeight: design.text.weightBold
  }
});
