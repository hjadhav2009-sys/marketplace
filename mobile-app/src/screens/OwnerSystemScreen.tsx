import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerSystem, testConnection } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard, OwnerMetric } from "../components/OwnerCard";
import { WorkerButton } from "../components/WorkerButton";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Data = Awaited<ReturnType<typeof getOwnerSystem>>;

export function OwnerSystemScreen({ serverUrl }: { serverUrl: string | null }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getOwnerSystem());
    } catch (err) {
      setError(err instanceof Error ? err.message : "System failed to load.");
    } finally {
      setLoading(false);
    }
  }

  async function runConnectionTest() {
    setMessage(null);
    setError(null);
    try {
      await testConnection();
      setMessage("Connected to mobile API.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>System</Text>
      <OwnerCard title="Server" subtitle={serverUrl ?? "No server URL saved"} badge="Local API">
        <WorkerButton onPress={runConnectionTest}>Test connection</WorkerButton>
        {message ? <Text style={styles.success}>{message}</Text> : null}
      </OwnerCard>
      {loading ? <LoadingState label="Loading system..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {data ? (
        <>
          <View style={styles.metrics}>
            <OwnerMetric label="Accounts" value={data.counts.activeAccounts} />
            <OwnerMetric label="Users" value={data.counts.activeUsers} />
            <OwnerMetric label="Open problems" value={data.counts.openProblems} />
            <OwnerMetric label="API" value={data.app.mobileApi} />
          </View>
          <OwnerCard title={data.app.name} subtitle={data.app.mode} badge="Safe">
            {data.notes.map((note) => <Text key={note} style={styles.note}>{note}</Text>)}
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
  note: {
    color: design.colors.textSubtle,
    fontSize: design.text.base,
    fontWeight: design.text.weightMedium
  },
  success: {
    color: design.colors.successText,
    fontWeight: design.text.weightBold
  }
});
