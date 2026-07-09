import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../api/client";
import { changePassword, login } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { WorkerButton } from "../components/WorkerButton";
import type { MobileUser } from "../types/mobile";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Props = {
  serverUrl: string | null;
  onLoggedIn: (user: MobileUser) => void;
  onChangeServer: () => void;
};

export function LoginScreen({ serverUrl, onLoggedIn, onChangeServer }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const response = await login(username.trim(), password);

      if (response.mustChangePassword) {
        setPasswordChangeRequired(true);
        setError("Password change required. Set a new password to continue.");
        return;
      }

      onLoggedIn(response.user);
    } catch (err) {
      if (err instanceof MobileApiError && err.mustChangePassword) {
        setPasswordChangeRequired(true);
        setError("Password change required. Set a new password to continue.");
      } else {
        setError("Invalid username or password.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordChange() {
    setBusy(true);
    setError(null);

    try {
      const response = await changePassword({
        currentPassword: password,
        newPassword,
        confirmPassword
      });
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordChangeRequired(false);
      onLoggedIn(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  if (passwordChangeRequired) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Change password</Text>
          <Text style={styles.copy}>Owner reset is complete. Set your new password to enter the app.</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="Temporary/current password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <TextInput
            onChangeText={setNewPassword}
            placeholder="New password"
            secureTextEntry
            style={styles.input}
            value={newPassword}
          />
          <TextInput
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
          />
          {error ? <ErrorState message={error} /> : null}
          <WorkerButton
            onPress={submitPasswordChange}
            loading={busy}
            disabled={!password || newPassword.length < 8 || !confirmPassword}
          >
            Save new password
          </WorkerButton>
          <WorkerButton
            onPress={() => {
              setPasswordChangeRequired(false);
              setError(null);
            }}
            variant="secondary"
          >
            Back to login
          </WorkerButton>
        </View>
      </KeyboardAvoidingView>
    );
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
    backgroundColor: design.colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 20
  },
  card: {
    ...design.card,
    gap: 14,
    padding: 20
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.hero,
    fontWeight: design.text.weightBlack
  },
  copy: {
    color: design.colors.textSubtle,
    fontSize: 15
  },
  server: {
    color: design.colors.berry,
    fontSize: 13,
    fontWeight: design.text.weightBold
  },
  input: {
    backgroundColor: design.colors.surfaceMuted,
    borderColor: design.colors.borderStrong,
    borderRadius: design.radius.lg,
    borderWidth: 1,
    color: design.colors.text,
    fontSize: 17,
    minHeight: design.sizes.inputHeight,
    paddingHorizontal: 14
  }
});
