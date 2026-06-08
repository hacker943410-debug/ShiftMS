import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
  title?: string;
}

interface ErrorBoundaryState {
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    errorMessage: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      errorMessage: error.message || "화면을 표시하는 중 오류가 발생했습니다."
    };
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.errorMessage) {
      this.setState({ errorMessage: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Renderer error boundary captured an error.", error, info.componentStack);
  }

  render() {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <section className="surface-card">
        <div className="section-heading compact-heading">
          <div>
            <p className="section-kicker">오류 격리</p>
            <h3>{this.props.title ?? "화면 오류"}</h3>
            <p>현재 화면에서 오류가 발생해 이 영역만 격리했습니다.</p>
          </div>
        </div>
        <p className="form-error-text">{this.state.errorMessage}</p>
        <button
          className="ghost-button compact-button"
          onClick={() => {
            this.setState({ errorMessage: null });
          }}
          type="button"
        >
          다시 시도
        </button>
      </section>
    );
  }
}
