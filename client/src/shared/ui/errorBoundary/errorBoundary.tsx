import { Component, type ErrorInfo, type ReactNode } from "react";
import { Container, Title, Description, ReloadButton } from "./errorBoundary.styles";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// getDerivedStateFromError/componentDidCatch는 훅으로 대체할 수 없어 클래스 컴포넌트로 작성한다.
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container>
          <Title>문제가 발생했습니다</Title>
          <Description>
            페이지를 표시하는 중 오류가 발생했습니다.
            <br />
            새로고침 후 다시 시도해주세요.
          </Description>
          <ReloadButton onClick={() => window.location.reload()}>
            새로고침
          </ReloadButton>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
