import { StyleSheet, Text, View } from "react-native";
import { webMobileDesign as design } from "../theme/webMobileDesign";
import { WorkerButton } from "./WorkerButton";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Something needs attention</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <WorkerButton onPress={onRetry} variant="secondary">Try again</WorkerButton> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: design.radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16
  },
  title: {
    color: "#9a3412",
    fontSize: 16,
    fontWeight: design.text.weightBlack
  },
  message: {
    color: "#7c2d12",
    fontSize: 14,
    lineHeight: 20
  }
});
