import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (options: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (title: string, message?: string) => toast({ type: 'success', title, message }),
    [toast],
  );

  const error = useCallback(
    (title: string, message?: string) => toast({ type: 'error', title, message }),
    [toast],
  );

  const info = useCallback(
    (title: string, message?: string) => toast({ type: 'info', title, message }),
    [toast],
  );

  return (
    <ToastContext.Provider value={{ toast, success, error, info, removeToast }}>
      {children}

      {/* Floating Toast Container */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full"
      >
        {toasts.map((t) => {
          const typeConfig = {
            success: {
              border: 'border-emerald-500/40 bg-[#0e1713]',
              icon: <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />,
              titleColor: 'text-emerald-300',
            },
            error: {
              border: 'border-rose-500/40 bg-[#170e10]',
              icon: <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />,
              titleColor: 'text-rose-300',
            },
            warning: {
              border: 'border-amber-500/40 bg-[#17140e]',
              icon: <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />,
              titleColor: 'text-amber-300',
            },
            info: {
              border: 'border-cyan-500/40 bg-[#0e1417]',
              icon: <Info className="h-4 w-4 text-cyan-400 flex-shrink-0" />,
              titleColor: 'text-cyan-300',
            },
          }[t.type];

          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto rounded-xl border p-3.5 shadow-2xl backdrop-blur-md flex items-start space-x-3 transition-all animate-in slide-in-from-bottom-5 duration-200 ${typeConfig.border}`}
            >
              <div className="pt-0.5">{typeConfig.icon}</div>
              <div className="flex-1 pr-2">
                <h4 className={`text-xs font-bold ${typeConfig.titleColor}`}>{t.title}</h4>
                {t.message && <p className="mt-0.5 text-[11px] text-gray-300">{t.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss toast"
                className="text-gray-400 hover:text-white transition-colors p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};
