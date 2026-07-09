import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileApiError } from "../api/client";
import { testConnection } from "../api/mobileApi";
import { isValidServerUrl, saveServerUrl } from "../storage/serverStorage";
import { ErrorState } from "../components/ErrorState";
import { WorkerButton } from "../components/WorkerButton";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Props = {
  currentUrl: string | null;
  onSaved: (url: string) => void;
};

export function ServerSettingsScreen({ currentUrl, onSaved }: Props) {
  const [url, setUrl] = useState(currentUrl ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveOnly() {
    setError(null);

    if (!isValidServerUrl(url)) {
      setError("Enter a URL like http://100.x.x.x:3001 or http://192.168.x.x:3001.");
      return;
    }

    const saved = await saveServerUrl(url);
    onSaved(saved);
  }

  async function testAndSave() {
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const saved = await saveServerUrl(url);
      await testConnection();
      setStatus("Connected. Server URL saved.");
      onSaved(saved);
    } catch (err) {
      const message = err instanceof MobileApiError ? err.message : "Server not reachable.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Server setup</Text>
        <Text style={styles.title}>Connect to owner PC</Text>
        <Text style={styles.copy}>
          Enter the local or Tailscale URL for the Marketplace Pick & Pack server. The Android app never connects to the database directly.
        </Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          onChangeText={setUrl}
          placeholder="http://100.x.x.x:3001"
          style={styles.input}
          value={url}
        />
        {error ? <ErrorState message={error} /> : null}
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <WorkerButton onPress={testAndSave} loading={busy}>Test connection</WorkerButton>
        <WorkerButton onPress={saveOnly} variant="secondary">Save server URL</WorkerButton>
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
  eyebrow: {
    color: design.colors.berry,
    fontSize: 13,
    fontWeight: design.text.weightBlack,
    textTransform: "uppercase"
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.hero,
    fontWeight: design.text.weightBlack
  },
  copy: {
    color: design.colors.textSubtle,
    fontSize: 15,
    lineHeight: 22
  },
  input: {
    backgroundColor: design.colors.surfaceMuted,
    borderColor: design.colors.borderStrong,
    borderRadius: design.radius.lg,
    borderWidth: 1,
    color: design.colors.text,
    fontSize: 16,
    minHeight: design.sizes.inputHeight,
    paddingHorizontal: 14
  },
  status: {
    color: design.colors.successText,
    fontSize: 14,
    fontWeight: design.text.weightBold
  }
});
