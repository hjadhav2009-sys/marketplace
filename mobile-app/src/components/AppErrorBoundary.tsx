import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { clearServerUrl } from "../storage/serverStorage";
import { clearSessionCookie } from "../storage/sessionStorage";
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

  resetApp = async () => {
    await Promise.all([clearServerUrl(), clearSessionCookie()]);
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.copy}>{safeErrorMessage(this.state.error)}</Text>
          <WorkerButton onPress={() => this.setState({ error: null })} variant="secondary">Try again</WorkerButton>
          <WorkerButton onPress={this.resetApp} variant="danger">Reset server/session</WorkerButton>
        </View>
      );
    }

    return this.props.children;
  }
}

function safeErrorMessage(error: Error) {
  const message = error.message || "Restart Expo Go and try again.";

  return message.length > 140 ? `${message.slice(0, 137)}...` : message;
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
