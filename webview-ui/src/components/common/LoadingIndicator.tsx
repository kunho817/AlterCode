
interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
}

export function LoadingIndicator({ size = 'medium', text }: LoadingIndicatorProps) {
  const sizeMap = {
    small: 12,
    medium: 16,
    large: 24,
  };

  const pixelSize = sizeMap[size];

  return (
    <div className="loading-indicator">
      <div
        className="spinner"
        style={{
          width: pixelSize,
          height: pixelSize,
        }}
      />
      {text && <span className="loading-text">{text}</span>}
      <style>{`
        .loading-indicator {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .loading-text {
          color: var(--altercode-text-muted);
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

export function ThinkingIndicator() {
  return (
    <div className="thinking-indicator">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <style>{`
        .thinking-indicator {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 0;
        }
        .thinking-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--altercode-text-muted);
          animation: thinking-bounce 1.4s ease-in-out infinite;
        }
        .thinking-dot:nth-child(1) {
          animation-delay: 0s;
        }
        .thinking-dot:nth-child(2) {
          animation-delay: 0.2s;
        }
        .thinking-dot:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes thinking-bounce {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
