import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { getMe, logout, selectMobileAccount, testConnection } from "../api/mobileApi";
import { clearSessionCookie } from "../storage/sessionStorage";
import type { MobileUser } from "../types/mobile";
import { ErrorState } from "../components/ErrorState";
import { StatusPill } from "../components/StatusPill";
import { WorkerButton } from "../components/WorkerButton";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Props = {
  user: MobileUser | null;
  serverUrl: string | null;
  onLogout: () => void;
  onChangeServer: () => void;
  onUserRefresh: (user: MobileUser | null) => void;
};

export function AccountScreen({ user, serverUrl, onLogout, onChangeServer, onUserRefresh }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function runConnectionTest() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      await testConnection();
      setMessage("Connected to server.");
      const me = await getMe().catch(() => null);

      if (me) {
        onUserRefresh(me.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitLogout() {
    setBusy(true);

    try {
      await logout().catch(() => undefined);
      await clearSessionCookie();
      onLogout();
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount(accountId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await selectMobileAccount(accountId);
      onUserRefresh(response.user);
      const selected = response.user.selectedAccount;
      setMessage(selected ? `Switched to ${selected.companyName ?? "Company"} / ${selected.marketplace} / ${selected.name}.` : "Account switched.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.name}>{user?.name ?? user?.username ?? "Not signed in"}</Text>
        {user ? <StatusPill label={user.role} tone="good" /> : null}
        <Text style={styles.label}>Server</Text>
        <Text style={styles.value}>{serverUrl ?? "No server URL saved"}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <ErrorState message={error} /> : null}
        <WorkerButton onPress={runConnectionTest} loading={busy}>Test connection</WorkerButton>
        <WorkerButton onPress={onChangeServer} variant="secondary">Change server URL</WorkerButton>
        <WorkerButton onPress={submitLogout} variant="danger" loading={busy}>Logout</WorkerButton>
      </View>
      <Text style={styles.sectionTitle}>Assigned accounts</Text>
      <FlatList
        contentContainerStyle={styles.accounts}
        data={user?.accounts ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <View style={styles.accountTitleWrap}>
                <Text style={styles.accountName}>{item.name}</Text>
                <Text style={styles.value}>{item.companyName ?? "Company"} / {item.marketplace}</Text>
              </View>
              {user?.selectedAccount?.id === item.id ? <StatusPill label="Selected" tone="good" /> : null}
            </View>
            {item.code ? <Text style={styles.value}>Code {item.code}</Text> : null}
            <WorkerButton
              onPress={() => switchAccount(item.id)}
              variant={user?.selectedAccount?.id === item.id ? "ghost" : "secondary"}
              disabled={busy || user?.selectedAccount?.id === item.id}
            >
              {user?.selectedAccount?.id === item.id ? "Current account" : "Switch to this account"}
            </WorkerButton>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No assigned account. Ask owner to assign one.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: design.colors.background,
    flex: 1,
    gap: 14,
    padding: 14
  },
  card: {
    ...design.card,
    gap: 12,
    padding: 16
  },
  title: {
    color: design.colors.text,
    fontSize: 24,
    fontWeight: design.text.weightBlack
  },
  name: {
    color: design.colors.textSubtle,
    fontSize: 17,
    fontWeight: design.text.weightBold
  },
  label: {
    color: design.colors.textMuted,
    fontSize: 12,
    fontWeight: design.text.weightBlack,
    textTransform: "uppercase"
  },
  value: {
    color: design.colors.textSubtle,
    fontSize: 14,
    fontWeight: design.text.weightMedium
  },
  message: {
    color: design.colors.successText,
    fontSize: 14,
    fontWeight: design.text.weightBold
  },
  sectionTitle: {
    color: design.colors.text,
    fontSize: 18,
    fontWeight: design.text.weightBlack
  },
  accounts: {
    gap: 10,
    paddingBottom: 20
  },
  accountCard: {
    ...design.card,
    gap: 10,
    padding: 14
  },
  accountHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  accountTitleWrap: {
    flex: 1
  },
  accountName: {
    color: design.colors.text,
    fontSize: 16,
    fontWeight: design.text.weightBlack
  },
  empty: {
    color: design.colors.textMuted,
    fontSize: 14
  }
});
