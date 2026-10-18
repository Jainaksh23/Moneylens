import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Info,
  RefreshCw,
  Layers,
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
        month: fp.month,
        forecast: fp.value,
        lower: fp.lower,
        upper: fp.upper,
      });
    }
  }

  const forecast = data?.forecast;

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
            Predictive time-series modeling evaluated strictly against a naive baseline.
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
                {h}M
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadForecast}
            disabled={isLoading}
            className="p-2 rounded-lg border border-gray-800 bg-gray-900/80 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Evaluation Integrity */}
      <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
        <div className="flex items-center space-x-2 text-sm text-emerald-400 font-semibold">
          <ShieldCheck className="h-4 w-4" />
          <span>Evaluation Integrity Guarantee</span>
        </div>
        <p className="mt-1 text-xs text-gray-400 leading-relaxed">
          Forecasting metrics (MAE, RMSE) use time-based splits with no shuffling or data leakage.
          Model selection is fully automated: Prophet is only used if it outperforms baselines.
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

      {/* Error state */}
      {error && !isLoading && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={loadForecast}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-800/50 text-red-200 text-xs hover:bg-red-700/50 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* No data state */}
      {!isLoading && !error && data && !data.available && (
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

      {/* Forecast available */}
      {!isLoading && !error && data?.available && forecast && (
        <>
          {/* Warnings */}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Model Used</div>
              <div className="mt-1 text-lg font-semibold text-white capitalize">
                {forecast.modelUsed.replace('_', ' ')}
              </div>
              <div className="text-xs text-gray-500 mt-1">{forecast.modelVersion}</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Data Coverage</div>
              <div className="mt-1 text-lg font-semibold text-cyan-400">
                {forecast.dataCoverage} months
              </div>
              <div className="text-xs text-gray-500 mt-1">of historical data</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Horizon</div>
              <div className="mt-1 text-lg font-semibold text-emerald-400">
                {forecast.horizon} months
              </div>
              <div className="text-xs text-gray-500 mt-1">forecast period</div>
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Layers className="h-5 w-5 text-cyan-400" />
              <h2 className="text-base font-semibold text-white">
                Monthly Net Cash Flow — History + Forecast
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
                          ? 'Forecast'
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
              <span>Projected Monthly Net Cash Flow</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-xs text-gray-500 font-medium py-2 px-3">Month</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2 px-3">Forecast</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2 px-3">Lower</th>
                    <th className="text-right text-xs text-gray-500 font-medium py-2 px-3">Upper</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.values.map((fp) => (
                    <tr key={fp.month} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                      <td className="py-2 px-3 text-gray-300 font-medium">{fp.month}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-semibold">
                        {formatCurrency(fp.value)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500">
                        {formatCurrency(fp.lower)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500">
                        {formatCurrency(fp.upper)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
