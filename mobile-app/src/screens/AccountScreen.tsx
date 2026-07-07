import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { getMe, logout, testConnection } from "../api/mobileApi";
import { clearSessionCookie } from "../storage/sessionStorage";
import type { MobileUser } from "../types/mobile";
import { ErrorState } from "../components/ErrorState";
import { StatusPill } from "../components/StatusPill";
import { WorkerButton } from "../components/WorkerButton";

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
            <Text style={styles.accountName}>{item.name}</Text>
            <Text style={styles.value}>{item.companyName ?? "Company"} / {item.marketplace}</Text>
            {item.code ? <Text style={styles.value}>Code {item.code}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No assigned account. Ask owner to assign one.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 14,
    padding: 14
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  },
  name: {
    color: "#334155",
    fontSize: 17,
    fontWeight: "800"
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  value: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700"
  },
  message: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "800"
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  accounts: {
    gap: 10,
    paddingBottom: 20
  },
  accountCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 14
  },
  accountName: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900"
  },
  empty: {
    color: "#64748b",
    fontSize: 14
  }
});
