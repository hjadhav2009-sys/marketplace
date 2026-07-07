import { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { getMe } from "./src/api/mobileApi";
import { clearSessionCookie } from "./src/storage/sessionStorage";
import { getServerUrl } from "./src/storage/serverStorage";
import type { MobileUser } from "./src/types/mobile";
import { AccountScreen } from "./src/screens/AccountScreen";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ServerSettingsScreen } from "./src/screens/ServerSettingsScreen";

export type AppRoute =
  | { name: "home" }
  | { name: "settings" }
  | { name: "login" };

export default function App() {
  return (
    <AppErrorBoundary>
      <RootApp />
    </AppErrorBoundary>
  );
}

function RootApp() {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [route, setRoute] = useState<AppRoute>({ name: "settings" });

  const refreshSession = useCallback(async () => {
    let savedServerUrl: string | null = null;

    try {
      savedServerUrl = await getServerUrl();
    } catch {
      savedServerUrl = null;
    }

    setServerUrl(savedServerUrl);

    if (!savedServerUrl) {
      setRoute({ name: "settings" });
      setBooting(false);
      return;
    }

    try {
      const response = await getMe();
      setUser(response.user);
      setRoute({ name: "home" });
    } catch {
      setUser(null);
      setRoute({ name: "login" });
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const accountLabel = useMemo(() => {
    const account = user?.accounts[0];
    return account ? `${account.marketplace} - ${account.name}` : "No account";
  }, [user]);

  async function handleLogout() {
    await clearSessionCookie().catch(() => undefined);
    setUser(null);
    setRoute({ name: "login" });
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.boot}>
          <Text style={styles.brand}>Marketplace Pick Pack</Text>
          <Text style={styles.muted}>Starting worker app...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.shell}>
        {route.name === "settings" ? (
          <ServerSettingsScreen
            currentUrl={serverUrl}
            onSaved={(url) => {
              setServerUrl(url);
              setRoute({ name: "login" });
            }}
          />
        ) : null}
        {route.name === "login" ? (
          <LoginScreen
            serverUrl={serverUrl}
            onChangeServer={() => setRoute({ name: "settings" })}
            onLoggedIn={(nextUser) => {
              setUser(nextUser);
              setRoute({ name: "home" });
            }}
          />
        ) : null}
        {route.name === "home" && user ? (
          <HomeScreen
            user={user}
            accountLabel={accountLabel}
            serverUrl={serverUrl}
            onLogout={handleLogout}
            onChangeServer={() => setRoute({ name: "settings" })}
            onUserRefresh={setUser}
          />
        ) : null}
        {route.name === "home" && !user ? (
          <AccountScreen
            user={null}
            serverUrl={serverUrl}
            onLogout={handleLogout}
            onChangeServer={() => setRoute({ name: "settings" })}
            onUserRefresh={setUser}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: "#f8fafc",
    flex: 1
  },
  shell: {
    flex: 1
  },
  boot: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  brand: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  },
  muted: {
    color: "#64748b",
    fontSize: 15,
    marginTop: 8
  }
});
