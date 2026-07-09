import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getOwnerAccounts } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { OwnerCard } from "../components/OwnerCard";
import { StatusPill } from "../components/StatusPill";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Account = Awaited<ReturnType<typeof getOwnerAccounts>>["accounts"][number];

export function OwnerAccountsScreen() {
  const insets = useSafeAreaInsets();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await getOwnerAccounts();
      setAccounts(response.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accounts failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    return accounts.reduce<Record<string, Account[]>>((result, account) => {
      result[account.marketplace] = [...(result[account.marketplace] ?? []), account];
      return result;
    }, {});
  }, [accounts]);

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) + 18 }]}>
      <Text style={styles.title}>Accounts</Text>
      {loading ? <LoadingState label="Loading accounts..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {Object.entries(grouped).map(([marketplace, rows]) => (
        <View key={marketplace} style={styles.group}>
          <Text style={styles.groupTitle}>{marketplace}</Text>
          {rows.map((account) => (
            <OwnerCard key={account.id} title={account.name} subtitle={`${account.companyName} / ${account.code}`} badge={account.active ? "Active" : "Inactive"}>
              <View style={styles.pills}>
                <StatusPill label={`${account.users} users`} />
                <StatusPill label={`${account.orders} orders`} />
                <StatusPill label={`${account.listings} listings`} />
                <StatusPill label={`${account.imports} imports`} />
              </View>
            </OwnerCard>
          ))}
        </View>
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
  group: {
    gap: design.spacing.sm
  },
  groupTitle: {
    color: design.colors.berry,
    fontSize: design.text.base,
    fontWeight: design.text.weightBlack,
    textTransform: "uppercase"
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: design.spacing.sm
  }
});
