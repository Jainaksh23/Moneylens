import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Info,
  RefreshCw,
  Layers,
  Clock,
  Calendar,
  AlertCircle,
  Upload,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { forecastService } from '../services/forecastService';
import type { ForecastResponse } from '../services/forecastService';

const formatCurrency = (val: number): string =>
  `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

interface ChartDataPoint {
  month: string;
  historical?: number;
  forecast?: number;
  lower?: number;
  upper?: number;
}

export const ForecastPage: React.FC = () => {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState(3);

  const loadForecast = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await forecastService.getForecast(horizon);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load forecast data',
      );
    } finally {
      setIsLoading(false);
    }
  }, [horizon]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  // Build combined chart data
  const chartData: ChartDataPoint[] = [];
  if (data?.monthlyTrend) {
    for (const item of data.monthlyTrend) {
      chartData.push({ month: item.month, historical: item.net });
    }
  }
  if (data?.available && data.forecast?.values) {
    // Add the last historical point as the start of forecast for visual continuity
    const lastHistorical = chartData[chartData.length - 1];
    if (lastHistorical) {
      lastHistorical.forecast = lastHistorical.historical;
      lastHistorical.lower = lastHistorical.historical;
      lastHistorical.upper = lastHistorical.historical;
    }
    for (const fp of data.forecast.values) {
      chartData.push({
        month: fp.month || fp.date || '',
        forecast: fp.value,
        lower: fp.lower,
        upper: fp.upper,
      });
    }
  }

  const forecast = data?.forecast;
  const isShortHistory = forecast?.mode === 'short_history' || forecast?.confidence === 'low';
  const coverageDays =
    typeof forecast?.dataCoverage === 'object'
      ? forecast.dataCoverage.days
      : typeof data?.dataCoverage === 'object'
        ? data.dataCoverage.days
        : isShortHistory
          ? 30
          : typeof forecast?.dataCoverage === 'number'
            ? forecast.dataCoverage * 30
            : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <TrendingUp className="h-6 w-6 text-cyan-400" />
            <span>Cash-Flow Forecasting</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Predictive cash-flow modeling evaluated strictly against baselines with transparent assumptions.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Horizon selector */}
          <div className="flex items-center space-x-1 rounded-xl border border-gray-800 bg-gray-900/80 p-1 text-xs">
            {([3, 6] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  horizon === h
                    ? 'bg-cyan-600 text-white font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {isShortHistory ? `${h}M (${h * 30}d)` : `${h}M`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadForecast}
            disabled={isLoading}
            className="p-2 rounded-lg border border-gray-800 bg-gray-900/80 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh forecast"
            aria-label="Refresh forecast"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Evaluation Integrity Banner */}
      <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
        <div className="flex items-center space-x-2 text-sm text-emerald-400 font-semibold">
          <ShieldCheck className="h-4 w-4" />
          <span>Evaluation Integrity Guarantee</span>
        </div>
        <p className="mt-1 text-xs text-gray-400 leading-relaxed">
          {isShortHistory
            ? 'Short-History Transparency: Projections use observed daily run-rates without fabricated machine-learning metrics. No backtest metric is claimed because history is under 2 months.'
            : 'Forecasting metrics (MAE, RMSE) use time-based sequential splits with no data leakage. Model selection is automated: advanced models are only selected if they outperform naive baselines.'}
        </p>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="h-80 rounded-2xl border border-gray-800 bg-[#0e131d]/60 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl border border-gray-800 bg-[#0e131d]/60 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Top-level client/network error state */}
      {error && !isLoading && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={loadForecast}
            className="mt-3 inline-flex items-center space-x-2 px-4 py-1.5 rounded-lg bg-red-800/50 text-red-200 text-xs hover:bg-red-700/50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Classified Non-Available States */}
      {!isLoading && !error && data && !data.available && (
        <>
          {/* State (a): ML service unreachable / timeout (Cold start waking up) */}
          {data.status === 'ml_unavailable' && (
            <div className="rounded-2xl border border-cyan-800/50 bg-gradient-to-b from-cyan-950/40 to-[#0e131d] p-8 text-center max-w-xl mx-auto shadow-lg">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-900/40 text-cyan-400 border border-cyan-800/60 mb-4">
                <Clock className="h-7 w-7 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Forecast service is waking up, please retry in a minute
              </h3>
              <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                The machine-learning service is spinning up after being idle on the cloud container.
                This typically takes 40–60 seconds.
              </p>
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={loadForecast}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold shadow-md transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Now</span>
                </button>
              </div>
            </div>
          )}

          {/* State (b): ML returned 4xx client error */}
          {data.status === 'generation_failed' && (
            <div className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-8 text-center max-w-xl mx-auto">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-900/30 text-amber-400 border border-amber-800/50 mb-3">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-white">
                Could not generate forecast
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                {data.reason && data.reason !== 'Could not generate forecast'
                  ? data.reason
                  : 'The forecasting service was unable to process the series parameters with current history.'}
              </p>
              <button
                type="button"
                onClick={loadForecast}
                className="mt-4 px-4 py-1.5 rounded-lg border border-gray-700 bg-gray-800 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* State (c): Insufficient data (< 14 days) */}
          {data.status === 'insufficient_data' && (
            <div className="rounded-2xl border border-dashed border-gray-800 bg-[#0e131d]/60 p-8 text-center max-w-xl mx-auto">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/80 text-cyan-400 mb-4">
                <Calendar className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold text-white">
                {data.reason || 'Insufficient transaction history'}
              </h3>
              <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                {data.dataCoverage?.days
                  ? `You currently have ${data.dataCoverage.days} of ${data.dataCoverage.minDaysRequired || 14} minimum required days of transactions. Once your account reaches 14 calendar days, short-history run-rate forecasting will automatically unlock.`
                  : 'Import at least 14 days of bank transactions to unlock cash-flow forecasting.'}
              </p>
              <div className="mt-6 flex justify-center">
                <Link
                  to="/import"
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold shadow-md transition-all"
                >
                  <Upload className="h-4 w-4" />
                  <span>Import Bank Statement</span>
                </Link>
              </div>
            </div>
          )}

          {/* Other/generic unavailable fallback */}
          {!['ml_unavailable', 'generation_failed', 'insufficient_data'].includes(data.status || '') && (
            <div className="rounded-xl border border-dashed border-gray-800 bg-[#0e131d]/40 p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800/80 text-gray-400">
                <LineChart className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-200">
                {data.reason || 'No data available for forecasting'}
              </h3>
              <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                Import transaction data to enable cash-flow forecasting.
              </p>
            </div>
          )}
        </>
      )}

      {/* Forecast available */}
      {!isLoading && !error && data?.available && forecast && (
        <>
          {/* Low Confidence Banner for Short-History Mode */}
          {isShortHistory && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center space-x-2 text-sm text-amber-400 font-semibold">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>Low confidence: based on only {coverageDays} days of data</span>
              </div>
              <p className="mt-1 text-xs text-amber-200/80 leading-relaxed">
                This forecast uses transparent daily run-rate extrapolation with variation bounds.
                One-off large items and annual recurring expenses cannot be inferred from short history.
              </p>
            </div>
          )}

          {/* 6M Horizon High Uncertainty Warning in Short-History Mode */}
          {isShortHistory && horizon === 6 && (
            <div className="flex items-start space-x-2 rounded-xl border border-red-500/40 bg-red-950/20 p-4">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-300">
                  High Horizon Uncertainty Warning
                </p>
                <p className="text-xs text-red-300/80 mt-0.5 leading-relaxed">
                  Projecting 6 months (180 days) from short-history data carries very high uncertainty.
                  A 3-month (90-day) horizon is strongly recommended until more transaction months accumulate.
                </p>
              </div>
            </div>
          )}

          {/* Warnings from ML service */}
          {forecast.warnings.length > 0 && (
            <div className="space-y-2">
              {forecast.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start space-x-2 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-300">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Model info cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Model Used</div>
              <div className="mt-1 text-base font-semibold text-white capitalize truncate">
                {forecast.modelUsed.replace(/_/g, ' ')}
              </div>
              <div className="text-xs text-gray-500 mt-1 flex items-center space-x-1.5">
                <span className="inline-block px-1.5 py-0.5 rounded bg-gray-800 text-[10px] text-gray-400">
                  {forecast.mode ? forecast.mode.replace(/_/g, ' ') : 'monthly'}
                </span>
                <span>{forecast.modelVersion}</span>
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Data Coverage</div>
              <div className="mt-1 text-base font-semibold text-cyan-400">
                {typeof forecast.dataCoverage === 'object'
                  ? `${forecast.dataCoverage.days} days`
                  : `${forecast.dataCoverage} months`}
              </div>
              <div className="text-xs text-gray-500 mt-1 truncate">
                {typeof forecast.dataCoverage === 'object' && forecast.dataCoverage.firstDate
                  ? `${forecast.dataCoverage.firstDate} to ${forecast.dataCoverage.lastDate}`
                  : 'of historical records'}
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Forecast Horizon</div>
              <div className="mt-1 text-base font-semibold text-emerald-400">
                {forecast.horizon} months
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {isShortHistory ? `${forecast.horizon * 30} days projected` : 'monthly outlook'}
              </div>
            </div>

            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Confidence Level</div>
              <div className="mt-1 text-base font-semibold">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    forecast.confidence === 'high'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                      : forecast.confidence === 'medium'
                        ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/60'
                        : 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                  }`}
                >
                  {(forecast.confidence || 'medium').toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {isShortHistory ? 'Run-rate extrapolation' : 'Backtested baseline'}
              </div>
            </div>
          </div>

          {/* Daily Run-Rate Card (if available in short-history mode) */}
          {forecast.runRateDaily && (
            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
                Observed Daily Run-Rate
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-gray-900/60 p-2.5 border border-gray-800">
                  <span className="text-xs text-gray-500 block">Avg Daily Income</span>
                  <span className="text-emerald-400 font-semibold">
                    {formatCurrency(forecast.runRateDaily.avgDailyIncome)}/day
                  </span>
                </div>
                <div className="rounded-lg bg-gray-900/60 p-2.5 border border-gray-800">
                  <span className="text-xs text-gray-500 block">Avg Daily Expense</span>
                  <span className="text-red-400 font-semibold">
                    {formatCurrency(forecast.runRateDaily.avgDailyExpense)}/day
                  </span>
                </div>
                <div className="rounded-lg bg-gray-900/60 p-2.5 border border-gray-800">
                  <span className="text-xs text-gray-500 block">Avg Daily Net</span>
                  <span
                    className={`font-semibold ${
                      forecast.runRateDaily.avgDailyNet >= 0 ? 'text-cyan-400' : 'text-amber-400'
                    }`}
                  >
                    {formatCurrency(forecast.runRateDaily.avgDailyNet)}/day
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Layers className="h-5 w-5 text-cyan-400" />
              <h2 className="text-base font-semibold text-white">
                Net Cash Flow — History + Projected Range
              </h2>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="historicalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#334155' }}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#334155' }}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value: any, name: any) => [
                      formatCurrency(Number(value) || 0),
                      name === 'historical'
                        ? 'Actual'
                        : name === 'forecast'
                          ? 'Forecast Point'
                          : name === 'upper'
                            ? 'Upper Bound'
                            : 'Lower Bound',
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />

                  {/* Confidence range */}
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="none"
                    fill="url(#rangeGrad)"
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="lower"
                    stroke="none"
                    fill="#0f172a"
                    connectNulls={false}
                  />

                  {/* Historical */}
                  <Area
                    type="monotone"
                    dataKey="historical"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#historicalGrad)"
                    dot={{ r: 3, fill: '#06b6d4' }}
                    connectNulls={false}
                  />

                  {/* Forecast */}
                  <Area
                    type="monotone"
                    dataKey="forecast"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    fill="url(#forecastGrad)"
                    dot={{ r: 3, fill: '#10b981' }}
                    connectNulls={false}
                  />

                  <Legend
                    wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
                    formatter={(value) =>
                      value === 'historical'
                        ? 'Actual'
                        : value === 'forecast'
                          ? 'Forecast'
                          : value === 'upper'
                            ? 'Upper CI'
                            : value === 'lower'
                              ? 'Lower CI'
                              : value
                    }
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Forecast values table */}
          <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-6">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center space-x-2">
              <Info className="h-4 w-4 text-gray-400" />
              <span>Projected Net Cash Flow by Period</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs text-gray-500 font-medium py-2 px-3">Period</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2 px-3">Forecast</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2 px-3">Lower Band</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2 px-3">Upper Band</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.values.map((fp, idx) => (
                    <tr
                      key={fp.month || fp.date || idx}
                      className="border-b border-gray-800/50 hover:bg-gray-800/20"
                    >
                      <td className="py-2 px-3 text-gray-300 font-medium">
                        {fp.month || fp.date}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-semibold">
                        {formatCurrency(fp.value)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-400">
                        {formatCurrency(fp.lower)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-400">
                        {formatCurrency(fp.upper)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transparency: Assumptions, Limitations & Backtest Evaluation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Explicit Assumptions */}
            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Modeling Assumptions
              </h4>
              {forecast.assumptions && forecast.assumptions.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-gray-300">
                  {forecast.assumptions.map((asm, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span>{asm}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">Standard time-series continuity assumed.</p>
              )}
            </div>

            {/* Modeling Limitations */}
            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Known Limitations
              </h4>
              {forecast.limitations && forecast.limitations.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-gray-300">
                  {forecast.limitations.map((lim, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="text-amber-400 font-bold">•</span>
                      <span>{lim}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500">No special limitations reported.</p>
              )}
            </div>
          </div>

          {/* Backtest Evaluation Statement */}
          {forecast.evaluation && (
            <div className="rounded-xl border border-gray-800/80 bg-gray-900/40 p-4 text-xs text-gray-400">
              <span className="font-semibold text-gray-300">Evaluation Basis: </span>
              <span>{forecast.evaluation}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
