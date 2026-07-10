import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppRoot } from "./src/app/AppRoot";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";

export default function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <AppRoot />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
