import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { Button } from "../button/Button";
import { colors } from "../../../theme/colors";
import { spacing } from "../../../theme/spacing";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

/**
 * 렌더 중 오류가 나면 앱이 하얗게 멈추는 대신 대체 화면을 보이고 Sentry로 보고한다.
 * 웹 shared/ui/errorBoundary와 같은 구조(클래스 컴포넌트 + componentStack은 contexts.react로만).
 * 웹은 새로고침하지만 앱엔 그게 없으므로 "다시 시도"는 상태를 초기화해 자식을 다시 렌더한다.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // scrubEvent가 contexts.react만 허용하므로 componentStack은 사용자 입력 없이 전달된다.
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack ?? "" } },
    });
  }

  private retry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>문제가 발생했습니다</Text>
          <Text style={styles.description}>
            {"화면을 표시하는 중 오류가 발생했습니다.\n다시 시도해 주세요."}
          </Text>
          <Button title="다시 시도" onPress={this.retry} variant="primary" style={styles.action} />
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  title: { fontSize: 18, fontWeight: "700", color: colors.text.primary, marginBottom: spacing.sm },
  description: { fontSize: 14, color: colors.text.secondary, textAlign: "center", lineHeight: 20 },
  action: { marginTop: spacing.xl, alignSelf: "stretch" },
});
