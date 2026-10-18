import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertOctagon,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  EyeOff,
  RotateCcw,
  RefreshCw,
  Info,
  Building2,
  Calendar,
  Layers,
} from 'lucide-react';
import { insightsService } from '../services/insightsService';
import type { AnomalyInsight } from '../services/insightsService';

const formatCurrency = (val: number): string =>
  `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const REASON_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  AMOUNT_ABOVE_USUAL: {
    label: 'Amount Above Usual',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  CATEGORY_SPIKE: {
    label: 'Category Spike',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/30',
  },
  NEW_MERCHANT_LARGE: {
    label: 'New Large Merchant',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/30',
  },
};

const SEVERITY_BADGES: Record<string, { label: string; color: string }> = {
  high: { label: 'High', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  medium: { label: 'Medium', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  low: { label: 'Low', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
};

export const AnomaliesPage: React.FC = () => {
  const [anomalies, setAnomalies] = useState<AnomalyInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'expected' | 'incorrect' | 'dismissed'>('all');

  const loadAnomalies = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const data = await insightsService.listAnomalies(
        statusFilter === 'all' ? undefined : statusFilter,
        refresh,
      );
      setAnomalies(data.anomalies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load anomalies');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadAnomalies();
  }, [loadAnomalies]);

  const handleUpdateStatus = async (
    id: string,
    status: 'open' | 'expected' | 'incorrect' | 'dismissed',
  ) => {
    try {
      await insightsService.updateAnomalyStatus(id, status);
      setAnomalies((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status } : a)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feedback');
    }
  };

  const filtered = statusFilter === 'all'
    ? anomalies
    : anomalies.filter((a) => a.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <AlertOctagon className="h-6 w-6 text-amber-400" />
            <span>Unusual Spending Insights</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Explainable anomaly detection via rolling median and robust dispersion statistics.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAnomalies(true)}
          disabled={isRefreshing}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gray-800 text-gray-200 text-sm font-medium hover:bg-gray-700 hover:text-white transition-colors border border-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
          <span>{isRefreshing ? 'Scanning...' : 'Scan Latest'}</span>
        </button>
      </div>

      {/* Mandatory Non-Fraud Disclaimer Banner */}
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start space-x-3">
        <Info className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200/90 leading-relaxed">
          <span className="font-semibold text-amber-300">Important Context: </span>
          These transactions are highlighted because they are <strong>unusual compared to your personal spending history</strong>.
          They are <strong>not flagged as fraud</strong> or unauthorized activity. Use this tool to catch accidental double-bills,
          unexpected subscription spikes, or unplanned discretionary splurges.
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b border-gray-800 pb-3 overflow-x-auto text-xs">
        {(['all', 'open', 'expected', 'incorrect', 'dismissed'] as const).map((tab) => {
          const count = tab === 'all'
            ? anomalies.length
            : anomalies.filter((a) => a.status === tab).length;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-colors ${
                statusFilter === tab
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              {tab} ({count})
            </button>
          );
        })}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-2xl border border-gray-800 bg-[#0e131d]/60 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-[#0e131d]/40 p-12 text-center">
          <ShieldAlert className="h-10 w-10 text-gray-600 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-gray-200">No Anomalies Found</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            {statusFilter === 'open'
              ? 'All clear! No unusual transactions in your recent spending history.'
              : `No transactions found matching the "${statusFilter}" status.`}
          </p>
        </div>
      )}

      {/* Anomalies List */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((item) => {
            const ev = item.evidence;
            const reasonCfg = REASON_LABELS[ev.reasonCode] || {
              label: ev.reasonCode,
              color: 'text-gray-300',
              bg: 'bg-gray-800',
            };
            const severityCfg = SEVERITY_BADGES[item.severity] || SEVERITY_BADGES.medium!;

            return (
              <div
                key={item._id}
                className="rounded-2xl border border-gray-800 bg-[#0e131d]/70 p-5 space-y-4 hover:border-gray-700 transition-all"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${reasonCfg.bg} ${reasonCfg.color}`}>
                      {reasonCfg.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium border uppercase tracking-wider ${severityCfg.color}`}>
                      {severityCfg.label} Severity
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      Status: <strong className="text-gray-300">{item.status}</strong>
                    </span>
                  </div>

                  <div className="text-xl font-bold text-white tracking-tight">
                    {formatCurrency(ev.amount)}
                  </div>
                </div>

                {/* Main Explanation */}
                <p className="text-sm text-gray-200 font-medium leading-relaxed">
                  {item.explanation}
                </p>

                {/* Evidence Metrics Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-gray-900/60 border border-gray-800/80 text-xs">
                  <div>
                    <span className="text-gray-500 block">Merchant</span>
                    <span className="text-white font-medium flex items-center space-x-1 mt-0.5">
                      <Building2 className="h-3 w-3 text-gray-400" />
                      <span>{ev.merchant}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Date</span>
                    <span className="text-white font-medium flex items-center space-x-1 mt-0.5">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      <span>{ev.date}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Category Baseline</span>
                    <span className="text-white font-medium mt-0.5 block">
                      Median: {ev.supportingValues?.usualMedian ? formatCurrency(ev.supportingValues.usualMedian) : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Robust Z-Score</span>
                    <span className="text-cyan-400 font-semibold mt-0.5 block">
                      {ev.robustZScore ? `${ev.robustZScore}σ` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Feedback Actions */}
                <div className="flex flex-wrap items-center justify-between pt-2 border-t border-gray-800/60 gap-3 text-xs">
                  <div className="text-[11px] text-gray-500 flex items-center space-x-1">
                    <Layers className="h-3 w-3" />
                    <span>Baseline: {item.period} (Model v{item.modelVersion})</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {item.status === 'open' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(item._id, 'expected')}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Mark Expected</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(item._id, 'incorrect')}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Mark Incorrect</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(item._id, 'dismissed')}
                          className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                          <span>Dismiss</span>
                        </button>
                      </>
                    )}
                    {item.status !== 'open' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(item._id, 'open')}
                        className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reopen</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
