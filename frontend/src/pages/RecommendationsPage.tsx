import React, { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  Sparkles,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Percent,
  RefreshCw,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { insightsService } from '../services/insightsService';
import type { Recommendation } from '../services/insightsService';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  category_spend_increase: TrendingDown,
  goal_shortfall: AlertTriangle,
  recurring_review: Clock,
  low_savings_rate: Percent,
  high_discretionary: Tag,
};

export const RecommendationsPage: React.FC = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await insightsService.listRecommendations();
      setRecommendations(data.recommendations);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to generate financial recommendations',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const handleUpdateStatus = (id: string, status: 'open' | 'dismissed' | 'done') => {
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status } : r)),
    );
  };

  const activeRecs = recommendations.filter((r) => r.status === 'open');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Lightbulb className="h-6 w-6 text-amber-400" />
            <span>Smart Recommendations</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Deterministic rule-driven financial insights with verified numbers and actionable next steps.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRecommendations}
          disabled={isLoading}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gray-800 text-gray-200 text-sm font-medium hover:bg-gray-700 hover:text-white transition-colors border border-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh Analysis</span>
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-2xl border border-gray-800 bg-[#0e131d]/60 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && activeRecs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-[#0e131d]/40 p-12 text-center">
          <ShieldCheck className="h-10 w-10 text-emerald-400 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-gray-200">No Action Items Pending</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            Your spending patterns, savings rate, and goal contributions are in good health.
          </p>
        </div>
      )}

      {/* Recommendations Cards */}
      {!isLoading && activeRecs.length > 0 && (
        <div className="space-y-4">
          {activeRecs.map((rec) => {
            const Icon = TYPE_ICONS[rec.type] || Sparkles;

            return (
              <div
                key={rec.id}
                className="rounded-2xl border border-gray-800 bg-[#0e131d]/70 p-6 space-y-4 hover:border-gray-700 transition-all"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center justify-center h-8 w-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          Priority #{rec.rank}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          Rule: {rec.rule} ({rec.threshold})
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {rec.title}
                      </h3>
                    </div>
                  </div>

                  <span className="text-xs text-gray-400 px-3 py-1 rounded-full bg-gray-900 border border-gray-800 self-start sm:self-auto">
                    Period: {rec.evidencePeriod}
                  </span>
                </div>

                {/* Rationale Narrative */}
                <p className="text-sm text-gray-300 leading-relaxed font-normal">
                  {rec.rationale}
                </p>

                {/* Estimated Financial Effect Banner */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center space-x-2 text-xs">
                  <Sparkles className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  <span className="font-semibold text-emerald-300">
                    {rec.estimatedEffect}
                  </span>
                </div>

                {/* Actionable Next Step Box */}
                <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-400 block">
                      Recommended Next Step
                    </span>
                    <p className="text-xs text-gray-200 font-medium">
                      {rec.actionableNextStep}
                    </p>
                  </div>

                  {rec.type === 'goal_shortfall' ? (
                    <Link
                      to="/goals"
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors flex-shrink-0 shadow-lg shadow-cyan-900/20"
                    >
                      <span>Adjust Goals</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : rec.type === 'category_spend_increase' ? (
                    <Link
                      to="/transactions"
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex-shrink-0 shadow-lg shadow-amber-900/20"
                    >
                      <span>View Transactions</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-3 pt-2 border-t border-gray-800/60 text-xs">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(rec.id, 'dismissed')}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Dismiss</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(rec.id, 'done')}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Mark as Done</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
