import { useState, useEffect } from 'react';
import './RateLimitCountdown.css';

interface RateLimitCountdownProps {
  retryAfterMs: number;
  onComplete: () => void;
}

export function RateLimitCountdown({ retryAfterMs, onComplete }: RateLimitCountdownProps) {
  const [remaining, setRemaining] = useState(retryAfterMs);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }

    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [retryAfterMs, onComplete, remaining]);

  const seconds = Math.ceil(remaining / 1000);
  const progress = (remaining / retryAfterMs) * 100;

  return (
    <div className="rate-limit-countdown">
      <div className="countdown-circle">
        <svg viewBox="0 0 36 36" className="countdown-svg">
          <path
            className="countdown-bg"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className="countdown-progress"
            strokeDasharray={`${progress}, 100`}
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <span className="countdown-number">{seconds}</span>
      </div>
      <span className="countdown-label">Retrying in {seconds}s</span>
    </div>
  );
}
