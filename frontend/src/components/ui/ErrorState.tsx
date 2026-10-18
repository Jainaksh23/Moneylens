import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'An unexpected error occurred while loading financial data. Please try again.',
  onRetry,
  isRetrying = false,
  className = '',
}) => {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8 sm:p-10 text-center shadow-xl space-y-4 max-w-xl mx-auto my-6 ${className}`}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
        <AlertCircle className="h-7 w-7" aria-hidden="true" />
      </div>

      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
        <p className="text-xs text-rose-300/90 max-w-sm mx-auto leading-relaxed">{message}</p>
      </div>

      {onRetry && (
        <div className="pt-2 flex justify-center">
          <Button
            variant="primary"
            size="md"
            onClick={onRetry}
            isLoading={isRetrying}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Retry Connection
          </Button>
        </div>
      )}
    </div>
  );
};
