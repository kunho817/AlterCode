import type { ErrorInfo } from '../../types/messages';
import { RateLimitCountdown } from './RateLimitCountdown';
import { useVSCodeAPI } from '../../hooks/useVSCodeAPI';
import './ErrorBanner.css';

interface ErrorBannerProps {
  error: ErrorInfo;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  const vscode = useVSCodeAPI();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // Default: re-send last message
      vscode.postMessage({ type: 'chat:retry', messageId: '' });
    }
  };

  return (
    <div className={`error-banner error-${error.category}`}>
      <div className="error-icon-wrapper">
        <ErrorIcon category={error.category} />
      </div>

      <div className="error-content">
        <div className="error-title">{getErrorTitle(error.category)}</div>
        <div className="error-message">{error.message}</div>
        {error.suggestion && (
          <div className="error-suggestion">{error.suggestion}</div>
        )}
      </div>

      <div className="error-actions">
        {error.category === 'rate_limit' && error.retryAfterMs ? (
          <RateLimitCountdown
            retryAfterMs={error.retryAfterMs}
            onComplete={handleRetry}
          />
        ) : error.retryable ? (
          <button className="retry-button" onClick={handleRetry}>
            <span className="codicon codicon-refresh" />
            Retry
          </button>
        ) : null}

        {onDismiss && (
          <button className="dismiss-button" onClick={onDismiss}>
            <span className="codicon codicon-close" />
          </button>
        )}
      </div>
    </div>
  );
}

function ErrorIcon({ category }: { category: ErrorInfo['category'] }) {
  const icons: Record<ErrorInfo['category'], string> = {
    network: '🌐',
    rate_limit: '⏱️',
    validation: '⚠️',
    timeout: '⏳',
    provider: '🔧',
    context_overflow: '📚',
    unknown: '❌',
  };

  return <span className="error-icon">{icons[category]}</span>;
}

function getErrorTitle(category: ErrorInfo['category']): string {
  const titles: Record<ErrorInfo['category'], string> = {
    network: 'Network Error',
    rate_limit: 'Rate Limited',
    validation: 'Validation Error',
    timeout: 'Request Timeout',
    provider: 'Provider Error',
    context_overflow: 'Context Too Long',
    unknown: 'Error',
  };

  return titles[category];
}
