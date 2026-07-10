import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WorkerButton } from "../components/WorkerButton";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Props = {
  onScanned: (value: string, format?: string) => void;
  onCancel: () => void;
};

export function ScannerScreen({ onScanned, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const lastScanAt = useRef(0);

  async function ensurePermission() {
    if (!permission?.granted) {
      await requestPermission();
    }
  }

  async function handleBarcode(result: BarcodeScanningResult) {
    const now = Date.now();
    const value = result.data?.trim();

    if (!value || now - lastScanAt.current < 1200 || value === lastScanned) {
      return;
    }

    lastScanAt.current = now;
    setLastScanned(value);
    Vibration.vibrate(80);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    onScanned(value, result.type);
  }

  if (!permission) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Text style={styles.title}>Camera scanner</Text>
        <Text style={styles.copy}>Checking camera support...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Text style={styles.title}>Camera permission</Text>
        <Text style={styles.copy}>Allow camera access to scan Tracking ID / AWB. Manual search still works if camera is unavailable.</Text>
        <WorkerButton onPress={ensurePermission}>Allow camera</WorkerButton>
        <WorkerButton onPress={onCancel} variant="secondary">Use manual search</WorkerButton>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14) }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Scanning...</Text>
            <Text style={styles.copy}>Point camera at the label barcode.</Text>
          </View>
          <Pressable onPress={onCancel} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
        </View>
      </View>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ["code128", "code39", "ean13", "ean8", "qr", "upc_a", "upc_e"] }}
        enableTorch={torch}
        onBarcodeScanned={handleBarcode}
        style={styles.camera}
      />
      {lastScanned ? <Text style={styles.last}>Last: {lastScanned.slice(0, 4)}...{lastScanned.slice(-4)}</Text> : null}
      <View style={styles.actions}>
        <WorkerButton onPress={() => setTorch((value) => !value)} variant="secondary">{torch ? "Flash off" : "Flash on"}</WorkerButton>
        <WorkerButton onPress={onCancel} variant="secondary">Manual entry</WorkerButton>
      </View>
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
  center: {
    backgroundColor: design.colors.background,
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 20
  },
  header: {
    gap: 4
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row"
  },
  headerCopy: {
    flex: 1
  },
  close: {
    alignItems: "center",
    borderColor: design.colors.border,
    borderRadius: design.radius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14
  },
  closeText: {
    color: design.colors.text,
    fontSize: 14,
    fontWeight: design.text.weightBold
  },
  title: {
    color: design.colors.text,
    fontSize: 24,
    fontWeight: design.text.weightBlack
  },
  copy: {
    color: design.colors.textMuted,
    fontSize: 15,
    lineHeight: 22
  },
  camera: {
    borderRadius: design.radius.xl,
    flex: 1,
    overflow: "hidden"
  },
  last: {
    color: design.colors.textSubtle,
    fontSize: 14,
    fontWeight: design.text.weightBold,
    textAlign: "center"
  },
  actions: {
    gap: 10
  }
});
