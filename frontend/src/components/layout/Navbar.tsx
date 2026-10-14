import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, ArrowUpRight } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

export const Navbar: React.FC = () => {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;
    const check = async () => {
      try {
        const res = await apiClient.checkHealth();
        if (isMounted) {
          setBackendStatus(res.status === 'ok' ? 'online' : 'offline');
        }
      } catch {
        if (isMounted) {
          setBackendStatus('offline');
        }
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-800 bg-[#0b0f17]/90 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <Link to="/" className="flex items-center space-x-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Money<span className="text-emerald-400">Lens</span>
            </span>
          </Link>
          <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
            INR ₹ Edition
          </span>
        </div>

        {/* Right Controls & Status Indicator */}
        <div className="flex items-center space-x-4">
          {/* Health Status Indicator */}
          <div
            className={`flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              backendStatus === 'online'
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                : backendStatus === 'checking'
                ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                : 'bg-rose-950/40 text-rose-400 border-rose-800/60'
            }`}
            title={`Backend Gateway: ${backendStatus}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                backendStatus === 'online'
                  ? 'bg-emerald-400 animate-pulse'
                  : backendStatus === 'checking'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="capitalize">{backendStatus === 'online' ? 'Gateway Live' : backendStatus}</span>
          </div>

          {/* Quick Auth Links */}
          {location.pathname !== '/login' && location.pathname !== '/register' ? (
            <div className="flex items-center space-x-2">
              <Link
                to="/login"
                className="text-xs font-medium text-gray-300 hover:text-white px-3 py-1.5 transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center space-x-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
              >
                <span>Get Started</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
