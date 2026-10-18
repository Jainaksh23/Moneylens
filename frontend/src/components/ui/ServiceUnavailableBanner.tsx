import { RefreshCw, Cpu } from 'lucide-react';

interface ServiceUnavailableBannerProps {
  serviceName?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ServiceUnavailableBanner: React.FC<ServiceUnavailableBannerProps> = ({
  serviceName = 'AI & Machine Learning Engine',
  message = 'Automated categorization and LLM insights are temporarily operating in offline fallback mode. Core ledger calculations, imports, and deterministic metrics remain fully operational.',
  onRetry,
  isRetrying = false,
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 sm:p-5 text-amber-200 shadow-lg ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Cpu className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-amber-300">
                {serviceName} Offline (Degraded Service)
              </span>
              <span className="inline-flex items-center rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                Fallback Active
              </span>
            </div>
            <p className="mt-1 text-xs text-amber-200/80 leading-relaxed">{message}</p>
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex flex-shrink-0 items-center space-x-1.5 rounded-xl border border-amber-500/40 bg-amber-900/40 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-800/50 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>Check Service</span>
          </button>
        )}
      </div>
    </div>
  );
};
