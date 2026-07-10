import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeButton } from "../components/NativeButton";
import { NativeErrorState } from "../components/NativeErrorState";
import { testServerConnection } from "../services/connectionService";
import { inspectServerUrl } from "../services/serverConfig";
import { saveServerUrl } from "../storage/serverStorage";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

type Props = { currentUrl: string | null; onSaved: (url: string) => void; onCancel?: () => void };

export function ServerSettingsScreen({ currentUrl, onSaved, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState(currentUrl ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function validateAndConfirm() {
    const result = inspectServerUrl(url);

    if (!result.normalized || result.kind === "invalid") {
      setError("Enter a complete http:// or https:// server address without a path.");
      return null;
    }

    if (result.kind === "unsafe-public-http") {
      return await new Promise<string | null>((resolve) => {
        Alert.alert(
          "Public HTTP is unsafe",
          "Use HTTPS, a private LAN address, or a Tailscale 100.x address. Save this address only if you understand the risk.",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
            { text: "Save anyway", style: "destructive", onPress: () => resolve(result.normalized) }
          ]
        );
      });
    }

    return result.normalized;
  }

  async function testAndSave() {
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const normalized = await validateAndConfirm();
      if (!normalized) return;
      const result = await testServerConnection(normalized);
      if (!result.ok) {
        setError(result.reason === "timeout" ? "Server timed out. Check the owner PC and Tailscale." : "Server is not reachable from this phone.");
        return;
      }
      const saved = await saveServerUrl(normalized);
      setStatus("Connected. Opening the web application...");
      onSaved(saved);
    } catch {
      setError("The server address could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Native connection</Text>
        <Text style={styles.title}>Connect to owner PC</Text>
        <Text style={styles.copy}>Use an HTTPS domain, Tailscale address, or same-Wi-Fi private address. The APK never connects directly to the database.</Text>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          onChangeText={setUrl}
          placeholder="http://100.x.x.x:3001"
          style={styles.input}
          value={url}
        />
        <Text style={styles.examples}>HTTPS: https://pack.example.com{"\n"}Tailscale: http://100.x.x.x:3001{"\n"}Local: http://192.168.x.x:3001</Text>
        {error ? <NativeErrorState title="Connection failed" message={error} /> : null}
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <NativeButton loading={busy} onPress={testAndSave}>Test, save and open</NativeButton>
        {onCancel ? <NativeButton onPress={onCancel} variant="secondary">Cancel</NativeButton> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { backgroundColor: theme.colors.background, flexGrow: 1, gap: 14, justifyContent: "center", paddingHorizontal: 20 },
  eyebrow: { color: theme.colors.primary, fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  title: { color: theme.colors.text, fontSize: 28, fontWeight: "900" },
  copy: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
  label: { color: theme.colors.text, fontSize: 14, fontWeight: "800", marginTop: 4 },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius, borderWidth: 1, color: theme.colors.text, fontSize: 16, minHeight: 52, paddingHorizontal: 14 },
  examples: { color: theme.colors.muted, fontSize: 13, lineHeight: 20 },
  status: { color: theme.colors.success, fontSize: 14, fontWeight: "800" }
});
