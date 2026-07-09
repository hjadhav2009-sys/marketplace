import { useRef, useState } from "react";
import { StyleSheet, Text, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { WorkerButton } from "../components/WorkerButton";
import { webMobileDesign as design } from "../theme/webMobileDesign";

type Props = {
  onScanned: (value: string) => void;
  onCancel: () => void;
};

export function ScannerScreen({ onScanned, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastScanned, setLastScanned] = useState<string | null>(null);
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
    onScanned(value);
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera scanner</Text>
        <Text style={styles.copy}>Checking camera support...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission</Text>
        <Text style={styles.copy}>Allow camera access to scan Tracking ID / AWB. Manual search still works if camera is unavailable.</Text>
        <WorkerButton onPress={ensurePermission}>Allow camera</WorkerButton>
        <WorkerButton onPress={onCancel} variant="secondary">Use manual search</WorkerButton>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Scanning...</Text>
        <Text style={styles.copy}>Point camera at the label barcode.</Text>
      </View>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ["code128", "code39", "ean13", "ean8", "qr", "upc_a", "upc_e"] }}
        onBarcodeScanned={handleBarcode}
        style={styles.camera}
      />
      {lastScanned ? <Text style={styles.last}>Last: {lastScanned.slice(0, 4)}...{lastScanned.slice(-4)}</Text> : null}
      <WorkerButton onPress={onCancel} variant="secondary">Cancel</WorkerButton>
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
  }
});
