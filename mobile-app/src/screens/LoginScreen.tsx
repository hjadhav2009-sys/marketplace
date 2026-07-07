import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../api/client";
import { login } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { WorkerButton } from "../components/WorkerButton";
import type { MobileUser } from "../types/mobile";

type Props = {
  serverUrl: string | null;
  onLoggedIn: (user: MobileUser) => void;
  onChangeServer: () => void;
};

export function LoginScreen({ serverUrl, onLoggedIn, onChangeServer }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const response = await login(username.trim(), password);

      if (response.mustChangePassword) {
        setError("Password change required. Please change password from the web app or ask the owner to reset it.");
        return;
      }

      onLoggedIn(response.user);
    } catch (err) {
      if (err instanceof MobileApiError && err.mustChangePassword) {
        setError("Password change required. Please change password from the web app or ask the owner to reset it.");
      } else {
        setError("Invalid username or password.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Marketplace Pick Pack</Text>
        <Text style={styles.copy}>Sign in with your worker account.</Text>
        <Text style={styles.server}>{serverUrl ?? "No server URL saved"}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setUsername}
          placeholder="Username"
          style={styles.input}
          value={username}
        />
        <TextInput
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {error ? <ErrorState message={error} /> : null}
        <WorkerButton onPress={submit} loading={busy} disabled={!username.trim() || !password}>Login</WorkerButton>
        <WorkerButton onPress={onChangeServer} variant="secondary">Change server URL</WorkerButton>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 20
  },
  title: {
    color: "#0f172a",
    fontSize: 28,
    fontWeight: "900"
  },
  copy: {
    color: "#475569",
    fontSize: 15
  },
  server: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800"
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: 14
  }
});
