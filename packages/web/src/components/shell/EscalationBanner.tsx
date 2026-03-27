'use client';

import { AlertTriangle, X } from 'lucide-react';

interface EscalationBannerProps {
  message?: string;
  onDismiss?: () => void;
  visible: boolean;
}

export function EscalationBanner({ message, onDismiss, visible }: EscalationBannerProps) {
  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes escalation-slide-in {
          from { transform: translateY(-40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .escalation-banner-enter {
          animation: escalation-slide-in 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
      `}</style>
      <div
        className="escalation-banner-enter flex items-center gap-3 px-4 py-3"
        role="alert"
        aria-live="assertive"
        style={{
          background: '#111820',
          borderLeft: '4px solid #f5a623',
          color: '#c8d6e5',
        }}
      >
        <AlertTriangle
          size={18}
          className="flex-shrink-0"
          style={{ color: '#f5a623' }}
          aria-hidden="true"
        />
        <span className="flex-1 text-sm">
          {message ?? 'Cauldron needs your guidance to continue.'}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex items-center justify-center w-6 h-6 rounded transition-colors flex-shrink-0"
            style={{ color: '#6b8399' }}
            aria-label="Dismiss escalation banner"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </>
  );
}
