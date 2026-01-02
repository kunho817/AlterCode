import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <span className="error-icon">⚠️</span>
            <h2>Something went wrong</h2>
            <p className="error-message">{this.state.error?.message}</p>
            <button
              className="btn-primary"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
          </div>
          <style>{`
            .error-boundary {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100%;
              padding: 20px;
            }
            .error-boundary-content {
              text-align: center;
              max-width: 400px;
            }
            .error-icon {
              font-size: 48px;
              display: block;
              margin-bottom: 16px;
            }
            .error-boundary h2 {
              margin-bottom: 8px;
              color: var(--altercode-text);
            }
            .error-message {
              color: var(--altercode-text-muted);
              margin-bottom: 16px;
              font-size: 12px;
              font-family: monospace;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}
