import * as Linking from "expo-linking";
import { StyleSheet, Text, View } from "react-native";
import { NativeButton } from "../components/NativeButton";
import { nativeShellTheme as theme } from "../theme/nativeShellTheme";

export function CameraPermissionScreen({ onRequest, onCancel, canAskAgain }: { onRequest: () => void; onCancel: () => void; canAskAgain: boolean }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Camera permission needed</Text>
      <Text style={styles.copy}>Camera access is used only while scanning a label barcode. Manual Tracking ID entry remains available in packing.</Text>
      {canAskAgain ? <NativeButton onPress={onRequest}>Allow camera</NativeButton> : <NativeButton onPress={() => Linking.openSettings()}>Open Android settings</NativeButton>}
      <NativeButton onPress={onCancel} variant="secondary">Cancel scanner</NativeButton>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.colors.background, flex: 1, gap: 14, justifyContent: "center", padding: 20 },
  title: { color: theme.colors.text, fontSize: 25, fontWeight: "900" },
  copy: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 }
});
