import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Percent,
  AlertCircle,
  UploadCloud,
  FileSpreadsheet,
  PieChart as PieIcon,
  BarChart3,
  RefreshCw,
  Bell,
  AlertOctagon,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { analyticsService } from '../services/analyticsService';
import type { AnalyticsSummary } from '../services/analyticsService';
import { insightsService } from '../services/insightsService';
import type { Recommendation } from '../services/insightsService';
import { remindersService } from '../services/remindersService';
import type { Reminder } from '../services/remindersService';

const CATEGORY_COLORS = [
  '#10b981', // emerald
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#8b5cf6', // purple
  '#f97316', // orange
  '#14b8a6', // teal
  '#ef4444', // red
  '#64748b', // slate
];

type PresetKey = '30d' | '3m' | '6m' | 'ytd' | 'all';

export const DashboardPage: React.FC = () => {
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>('all');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Insights & Reminders state
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [anomaliesCount, setAnomaliesCount] = useState<number>(0);
  const [topRecommendation, setTopRecommendation] = useState<Recommendation | null>(null);
  const [isDetectingReminders, setIsDetectingReminders] = useState(false);

  const calculateDateRange = (preset: PresetKey): { from?: string; to?: string } => {
    const today = new Date();
    const to = today.toISOString().split('T')[0]!;

    if (preset === 'all') {
      return {};
    }

    if (preset === '30d') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      return { from: past.toISOString().split('T')[0]!, to };
    }

    if (preset === '3m') {
      const past = new Date();
      past.setMonth(past.getMonth() - 3);
      return { from: past.toISOString().split('T')[0]!, to };
    }

    if (preset === '6m') {
      const past = new Date();
      past.setMonth(past.getMonth() - 6);
      return { from: past.toISOString().split('T')[0]!, to };
    }

    if (preset === 'ytd') {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return { from: yearStart.toISOString().split('T')[0]!, to };
    }

    return {};
  };

  const loadInsightsAndReminders = useCallback(async () => {
    try {
      const [remData, anomData, recData] = await Promise.allSettled([
        remindersService.listReminders(),
        insightsService.listAnomalies('open'),
        insightsService.listRecommendations(),
      ]);
      if (remData.status === 'fulfilled') {
        setReminders(remData.value.reminders);
      }
      if (anomData.status === 'fulfilled') {
        setAnomaliesCount(anomData.value.anomalies.length);
      }
      if (recData.status === 'fulfilled') {
        const active = recData.value.recommendations.filter((r) => r.status === 'open');
        setTopRecommendation(active[0] || null);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    const { from, to } = calculateDateRange(selectedPreset);
    try {
      const data = await analyticsService.getSummary(from, to);
      setSummary(data);
      loadInsightsAndReminders();
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : 'Unable to connect to financial analytics service',
      );
    } finally {
      setIsLoading(false);
    }
  }, [selectedPreset, loadInsightsAndReminders]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleConfirmReminder = async (id: string) => {
    try {
      await remindersService.updateReminder(id, { status: 'confirmed' });
      setReminders((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status: 'confirmed' } : r)),
      );
    } catch {
      // Non-fatal
    }
  };

  const handleDetectReminders = async () => {
    setIsDetectingReminders(true);
    try {
      const res = await remindersService.detectReminders();
      setReminders(res.reminders);
    } catch {
      // Non-fatal
    } finally {
      setIsDetectingReminders(false);
    }
  };

  const hasActivity = summary && summary.transactionCount > 0;

  return (
    <div className="space-y-6">
      {/* Page Header & Preset Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Wallet className="h-6 w-6 text-emerald-400" />
            <span>Financial Intelligence Dashboard</span>
          </h1>
          <p className="mt-1 text-xs text-gray-400">
            INR ₹ cash-flow insights, savings rate metrics, and category distribution.
          </p>
        </div>

        {/* Date Filter Presets */}
        <div className="flex items-center space-x-1 rounded-xl border border-gray-800 bg-gray-900/80 p-1 text-xs">
          {(
            [
              { key: '30d', label: '30 Days' },
              { key: '3m', label: '3 Months' },
              { key: '6m', label: '6 Months' },
              { key: 'ytd', label: 'YTD' },
              { key: 'all', label: 'All Time' },
            ] as const
          ).map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => setSelectedPreset(preset.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                selectedPreset === preset.key
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* STATE 1: LOADING SKELETON */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-5 animate-pulse"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80 rounded-2xl border border-gray-800 bg-[#0e131d]/60 animate-pulse" />
            <div className="h-80 rounded-2xl border border-gray-800 bg-[#0e131d]/60 animate-pulse" />
          </div>
        </div>
      ) : fetchError ? (
        /* STATE 2: FAILED FETCH ERROR BANNER (Distinguishable from zero activity!) */
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8 text-center space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-400" />
          <h2 className="text-base font-bold text-white">Analytics Unavailable</h2>
          <p className="text-xs text-rose-300 max-w-md mx-auto">{fetchError}</p>
          <div className="pt-2">
            <button
              id="retry-analytics-button"
              onClick={loadAnalytics}
              className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Fetch</span>
            </button>
          </div>
        </div>
      ) : !hasActivity ? (
        /* STATE 3: ZERO ACTIVITY EMPTY STATE */
        <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-12 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/60 text-gray-400">
            <FileSpreadsheet className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">No Financial Activity Recorded</h2>
            <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto leading-relaxed">
              You haven't recorded any transactions for the selected timeframe. Import a bank
              statement CSV or add manual records to unlock auto-categorization and cash-flow
              forecasts.
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <Link
              to="/import"
              className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 transition-colors"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Import Bank CSV</span>
            </Link>
            <Link
              to="/transactions"
              className="inline-flex items-center space-x-1.5 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-2 text-xs font-medium text-gray-300 hover:text-white"
            >
              <span>Go to Ledger</span>
            </Link>
          </div>
        </div>
      ) : (
        /* STATE 4: ACTIVE ANALYTICS DASHBOARD */
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Income */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Total Income</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold font-mono text-emerald-400">
                ₹{summary!.income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Inflows across selected period</p>
            </div>

            {/* Total Expenses */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Total Expenses</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold font-mono text-gray-100">
                ₹{summary!.expense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Outflows across selected period</p>
            </div>

            {/* Net Cash Flow */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Net Cash-Flow</span>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    summary!.net >= 0
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-rose-500/10 text-rose-400'
                  }`}
                >
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p
                className={`mt-3 text-2xl font-bold font-mono ${
                  summary!.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {summary!.net >= 0 ? '+ ' : ''}₹
                {summary!.net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                {summary!.net >= 0 ? 'Net surplus retained' : 'Deficit in period'}
              </p>
            </div>

            {/* Savings Rate */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">Savings Rate</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Percent className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold font-mono text-indigo-400">
                {summary!.income > 0 ? `${summary!.savingsRate.toFixed(1)}%` : 'N/A'}
              </p>
              {summary!.income > 0 ? (
                <div className="mt-2 h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, summary!.savingsRate))}%` }}
                  />
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-gray-500">No income in selected period</p>
              )}
            </div>
          </div>

          {/* Top Insights & Upcoming Reminders Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Insights & Anomalies Banner */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-5 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    <span>Top Intelligence & Action Items</span>
                  </h2>
                  <Link
                    to="/recommendations"
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1"
                  >
                    <span>View all</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                <div className="mt-3 space-y-3">
                  {/* Anomalies alert if any */}
                  {anomaliesCount > 0 && (
                    <Link
                      to="/anomalies"
                      className="block p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <AlertOctagon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                          <span className="text-xs font-semibold text-amber-200">
                            {anomaliesCount} Unusual Transaction{anomaliesCount > 1 ? 's' : ''} Detected
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-400 font-medium">Review &rarr;</span>
                      </div>
                      <p className="mt-1 text-[11px] text-amber-300/80">
                        Unusual spending compared to your history. Not flagged as fraud.
                      </p>
                    </Link>
                  )}

                  {/* Top Recommendation */}
                  {topRecommendation ? (
                    <div className="p-3.5 rounded-xl border border-gray-800 bg-gray-900/60 space-y-2">
                      <div className="flex items-center space-x-2">
                        <Lightbulb className="h-4 w-4 text-amber-400 flex-shrink-0" />
                        <span className="text-xs font-bold text-white">
                          {topRecommendation.title}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 line-clamp-2">
                        {topRecommendation.rationale}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] font-semibold text-emerald-400">
                          {topRecommendation.estimatedEffect}
                        </span>
                        <Link
                          to="/recommendations"
                          className="text-[11px] text-cyan-400 hover:underline flex items-center space-x-1"
                        >
                          <span>Take Action</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 py-3 text-center">
                      All financial habits and contributions are healthy!
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Upcoming Bills & EMI Reminders Widget */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-5 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                    <Bell className="h-4 w-4 text-cyan-400" />
                    <span>Upcoming Bills & EMI Dues</span>
                  </h2>
                  <button
                    type="button"
                    onClick={handleDetectReminders}
                    disabled={isDetectingReminders}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
                  >
                    <RefreshCw className={`h-3 w-3 ${isDetectingReminders ? 'animate-spin' : ''}`} />
                    <span>Scan Recurring</span>
                  </button>
                </div>

                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                  {reminders.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-500 space-y-2">
                      <p>No active reminders or upcoming dues.</p>
                      <button
                        type="button"
                        onClick={handleDetectReminders}
                        className="px-3 py-1 rounded-lg bg-cyan-600/20 text-cyan-300 text-xs font-medium hover:bg-cyan-600/30 transition-colors"
                      >
                        Auto-detect from transactions
                      </button>
                    </div>
                  ) : (
                    reminders.slice(0, 4).map((rem) => {
                      const today = new Date().getDate();
                      const daysLeft = rem.dueDay >= today ? rem.dueDay - today : 30 - (today - rem.dueDay);

                      return (
                        <div
                          key={rem._id}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-gray-800 bg-gray-900/50 text-xs"
                        >
                          <div className="flex items-center space-x-2.5">
                            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex flex-col items-center justify-center text-[10px] font-bold leading-none">
                              <span>D</span>
                              <span>{rem.dueDay}</span>
                            </span>
                            <div>
                              <div className="font-semibold text-white">{rem.title}</div>
                              <span className="text-[10px] text-gray-400">
                                {daysLeft === 0 ? 'Due Today' : `Due in ${daysLeft} days`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-white">
                              ₹{rem.amount.toLocaleString('en-IN')}
                            </span>
                            {rem.status === 'confirmed' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Paid
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleConfirmReminder(rem._id)}
                                title="Mark as confirmed / paid"
                                className="p-1 rounded-lg bg-gray-800 hover:bg-emerald-600 text-gray-400 hover:text-white transition-colors"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Visualizations Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Category Breakdown Donut Chart */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                    <PieIcon className="h-4 w-4 text-emerald-400" />
                    <span>Expense Breakdown by Category</span>
                  </h2>
                  <span className="text-[11px] text-gray-500">
                    {summary!.categoryTotals.length} Categories
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Distribution of outflows categorized deterministically and by model rules.
                </p>
              </div>

              {summary!.categoryTotals.length === 0 ? (
                <div className="py-16 text-center text-xs text-gray-500">
                  No expense categories recorded in this date range
                </div>
              ) : (
                <div className="mt-4 flex flex-col sm:flex-row items-center gap-6">
                  {/* Donut Chart */}
                  <div className="h-56 w-56 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={summary!.categoryTotals}
                          dataKey="amount"
                          nameKey="category"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                        >
                          {summary!.categoryTotals.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: any) => [
                            `₹${Number(value).toLocaleString('en-IN')}`,
                            'Amount',
                          ]}
                          contentStyle={{
                            backgroundColor: '#0e131d',
                            borderColor: '#374151',
                            borderRadius: '0.75rem',
                            fontSize: '0.75rem',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Category Legend List */}
                  <div className="flex-1 w-full space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                    {summary!.categoryTotals.map((cat, idx) => (
                      <div
                        key={cat.category}
                        className="flex items-center justify-between py-1 border-b border-gray-800/40"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                            }}
                          />
                          <span className="text-gray-300 truncate">{cat.category}</span>
                        </div>
                        <div className="text-right font-mono text-[11px] flex items-center space-x-2">
                          <span className="text-gray-400">{cat.percentage}%</span>
                          <span className="text-gray-200 font-semibold">
                            ₹{cat.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Monthly Trend Bar Chart */}
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-6 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                    <BarChart3 className="h-4 w-4 text-emerald-400" />
                    <span>Monthly Cash-Flow Trend (Asia/Kolkata)</span>
                  </h2>
                  <span className="text-[11px] text-gray-500">Income vs Outflow</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Chronological month-over-month INR cash movement without double-negation.
                </p>
              </div>

              {summary!.monthlyTrend.length === 0 ? (
                <div className="py-16 text-center text-xs text-gray-500">
                  No monthly trend records in this range
                </div>
              ) : (
                <div className="h-64 w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary!.monthlyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis dataKey="month" stroke="#6b7280" fontSize={11} />
                      <YAxis
                        stroke="#6b7280"
                        fontSize={11}
                        tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
                      />
                      <RechartsTooltip
                        formatter={(val: any) => [
                          `₹${Number(val).toLocaleString('en-IN')}`,
                          '',
                        ]}
                        contentStyle={{
                          backgroundColor: '#0e131d',
                          borderColor: '#374151',
                          borderRadius: '0.75rem',
                          fontSize: '0.75rem',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
                      <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
