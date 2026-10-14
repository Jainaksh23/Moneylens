import React, { useState } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

export const DashboardPage: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testBackendConnection = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.checkHealth();
      setHealthStatus(`Connected! Health status: ${res.status}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to reach backend gateway');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Personal Financial Intelligence
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Indian Rupee (INR) cash-flow monitor, deterministic scoring & grounded decision support.
          </p>
        </div>
        <div>
          <button
            onClick={testBackendConnection}
            disabled={loading}
            className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Verify Backend Live Status</span>
          </button>
        </div>
      </div>

      {/* Gateway Response Banner */}
      {healthStatus && (
        <div className="flex items-center space-x-2 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-sm text-emerald-400">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span>{healthStatus}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center space-x-2 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-sm text-rose-400">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards (Preview State) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-[#0e131d]/80 p-5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Monthly Inflow</span>
            <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">₹ 85,000</p>
          <p className="mt-1 text-xs text-gray-500">Salary & investments (Sample)</p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-[#0e131d]/80 p-5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Monthly Outflow</span>
            <ArrowUpRight className="h-4 w-4 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">₹ 48,250</p>
          <p className="mt-1 text-xs text-gray-500">Rent, EMI, utilities & food</p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-[#0e131d]/80 p-5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Savings Rate</span>
            <Wallet className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">43.2%</p>
          <p className="mt-1 text-xs text-gray-500">Computed via deterministic math</p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-[#0e131d]/80 p-5">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Forecasted Surplus</span>
            <TrendingUp className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">₹ 36,750</p>
          <p className="mt-1 text-xs text-gray-500">Time-series 30-day projection</p>
        </div>
      </div>

      {/* Architecture & Project Stage Status */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <h2 className="text-base font-semibold text-white">Phase 1 Monorepo Scaffolding Complete</h2>
        <p className="mt-2 text-sm text-gray-400 leading-relaxed">
          The monorepo structure is established. Express API gateway with Pino JSON logging and strict Zod validation is connected. The Python 3.11 FastAPI ML Service is secured with internal secret tokens (<code className="text-emerald-400">X-Internal-Key</code>), and the React Vite TypeScript client uses an isolated fetch wrapper.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-gray-800 px-2.5 py-1 text-gray-300">FastAPI ML Gateway: Port 8000</span>
          <span className="rounded-md bg-gray-800 px-2.5 py-1 text-gray-300">Node API Gateway: Port 5000</span>
          <span className="rounded-md bg-gray-800 px-2.5 py-1 text-gray-300">React Frontend: Port 5173</span>
        </div>
      </div>
    </div>
  );
};
