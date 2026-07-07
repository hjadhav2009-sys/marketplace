import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WorkerButton } from "./WorkerButton";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>App could not start</Text>
          <Text style={styles.copy}>{this.state.error.message || "Restart Expo Go and try again."}</Text>
          <WorkerButton onPress={() => this.setState({ error: null })} variant="secondary">Try again</WorkerButton>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 20
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  },
  copy: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22
  }
});
