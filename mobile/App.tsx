// 반드시 첫 import — 다른 모든 초기화보다 먼저 Sentry를 켠다(firebase 초기화 오류도 잡히게).
import "./src/shared/lib/sentryInit";
import "./src/firebase";
import * as Sentry from "@sentry/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { AppErrorBoundary } from "./src/shared/ui/errorBoundary/AppErrorBoundary";

const queryClient = new QueryClient();

function App() {
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);
