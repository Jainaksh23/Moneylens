import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Calculator,
  Plus,
  X,
  Trash2,
  Edit3,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Info,
} from 'lucide-react';
import { goalsService } from '../services/goalsService';
import type {
  Goal,
  CreateGoalInput,
  GoalScoreResponse,
} from '../services/goalsService';

const formatCurrency = (val: number): string =>
  `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const BAND_CONFIG = {
  on_track: {
    label: 'On Track',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    icon: CheckCircle2,
    barColor: 'bg-emerald-500',
  },
  needs_attention: {
    label: 'Needs Attention',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
    icon: Clock,
    barColor: 'bg-amber-500',
  },
  unlikely: {
    label: 'Unlikely',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
    icon: AlertTriangle,
    barColor: 'bg-red-500',
  },
};

const PRIORITY_COLORS = {
  high: 'text-red-400 bg-red-500/10',
  medium: 'text-amber-400 bg-amber-500/10',
  low: 'text-emerald-400 bg-emerald-500/10',
};

export const GoalsPage: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [scoreData, setScoreData] = useState<GoalScoreResponse | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // What-if sliders
  const [whatIfContribution, setWhatIfContribution] = useState<number>(0);
  const [whatIfReturn, setWhatIfReturn] = useState<number>(6);

  // Form state
  const [formData, setFormData] = useState<CreateGoalInput>({
    name: '',
    targetAmount: 0,
    currentAmount: 0,
    targetDate: '',
    priority: 'medium',
    monthlyContribution: null,
    expectedReturnRate: null,
  });

  const loadGoals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await goalsService.listGoals();
      setGoals(result.goals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const loadScore = useCallback(
    async (goalId: string, contribution?: number, annualReturn?: number) => {
      setScoreLoading(true);
      try {
        const result = await goalsService.getScore(goalId, contribution, annualReturn);
        setScoreData(result);
      } catch {
        setScoreData(null);
      } finally {
        setScoreLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedGoalId) {
      loadScore(selectedGoalId, whatIfContribution || undefined, whatIfReturn);
    }
  }, [selectedGoalId, whatIfContribution, whatIfReturn, loadScore]);

  const handleCreateGoal = async () => {
    try {
      await goalsService.createGoal(formData);
      setShowForm(false);
      setFormData({
        name: '',
        targetAmount: 0,
        currentAmount: 0,
        targetDate: '',
        priority: 'medium',
        monthlyContribution: null,
        expectedReturnRate: null,
      });
      loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create goal');
    }
  };

  const handleUpdateGoal = async () => {
    if (!editingGoal) return;
    try {
      await goalsService.updateGoal(editingGoal._id, formData);
      setEditingGoal(null);
      setShowForm(false);
      loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update goal');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    try {
      await goalsService.deleteGoal(id);
      if (selectedGoalId === id) {
        setSelectedGoalId(null);
        setScoreData(null);
      }
      loadGoals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete goal');
    }
  };

  const openEditForm = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      targetDate: goal.targetDate.split('T')[0]!,
      priority: goal.priority,
      monthlyContribution: goal.monthlyContribution ?? null,
      expectedReturnRate: goal.expectedReturnRate ?? null,
    });
    setShowForm(true);
  };

  const score = scoreData?.score;
  const bandConfig = score ? BAND_CONFIG[score.band] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Target className="h-6 w-6 text-emerald-400" />
            <span>Savings Goals & SIP Simulator</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Goal achievability scoring and deterministic what-if compounding calculations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingGoal(null);
            setFormData({
              name: '',
              targetAmount: 0,
              currentAmount: 0,
              targetDate: '',
              priority: 'medium',
              monthlyContribution: null,
              expectedReturnRate: null,
            });
            setShowForm(true);
          }}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/30"
        >
          <Plus className="h-4 w-4" />
          <span>New Goal</span>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-300 flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Create/Edit Goal Modal */}
      {showForm && (
        <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {editingGoal ? 'Edit Goal' : 'Create New Goal'}
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="goal-name">Goal Name</label>
              <input
                id="goal-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Emergency Fund"
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="goal-target">Target Amount (₹)</label>
              <input
                id="goal-target"
                type="number"
                value={formData.targetAmount || ''}
                onChange={(e) => setFormData({ ...formData, targetAmount: parseFloat(e.target.value) || 0 })}
                placeholder="500000"
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="goal-current">Current Amount (₹)</label>
              <input
                id="goal-current"
                type="number"
                value={formData.currentAmount || ''}
                onChange={(e) => setFormData({ ...formData, currentAmount: parseFloat(e.target.value) || 0 })}
                placeholder="50000"
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="goal-date">Target Date</label>
              <input
                id="goal-date"
                type="date"
                value={formData.targetDate}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="goal-priority">Priority</label>
              <select
                id="goal-priority"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'high' | 'medium' | 'low' })}
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="goal-sip">Monthly SIP (₹, optional)</label>
              <input
                id="goal-sip"
                type="number"
                value={formData.monthlyContribution ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    monthlyContribution: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="10000"
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="goal-return">Expected Return (% p.a., optional)</label>
              <input
                id="goal-return"
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={formData.expectedReturnRate ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    expectedReturnRate: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="6.0"
                className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={editingGoal ? handleUpdateGoal : handleCreateGoal}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
            >
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 rounded-2xl border border-gray-800 bg-[#0e131d]/60 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && goals.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-800 bg-[#0e131d]/40 p-12 text-center">
          <Target className="h-10 w-10 text-gray-600 mx-auto" />
          <h3 className="mt-4 text-base font-semibold text-gray-200">No Goals Yet</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            Create your first savings goal to track progress and get achievability insights.
          </p>
        </div>
      )}

      {/* Goals Grid + Score Panel */}
      {!isLoading && goals.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Goals List */}
          <div className="lg:col-span-2 space-y-4">
            {goals.map((goal) => {
              const progress = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
              const priorityStyle = PRIORITY_COLORS[goal.priority];
              const isSelected = selectedGoalId === goal._id;

              return (
                <div
                  key={goal._id}
                  className={`rounded-2xl border p-5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600/60 bg-emerald-950/20 shadow-lg shadow-emerald-900/20'
                      : 'border-gray-800 bg-[#0e131d]/60 hover:border-gray-700'
                  }`}
                  onClick={() => {
                    setSelectedGoalId(goal._id);
                    setWhatIfContribution(goal.monthlyContribution || 0);
                    if (goal.expectedReturnRate) {
                      setWhatIfReturn(goal.expectedReturnRate);
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-semibold text-white">{goal.name}</h3>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${priorityStyle}`}>
                          {goal.priority}
                        </span>
                        {goal.status !== 'active' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                            {goal.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
                        <span>Target: {formatCurrency(goal.targetAmount)}</span>
                        <span>Saved: {formatCurrency(goal.currentAmount)}</span>
                        <span>
                          Deadline:{' '}
                          {new Date(goal.targetDate).toLocaleDateString('en-IN', {
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditForm(goal);
                        }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGoal(goal._id);
                        }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight
                        className={`h-4 w-4 transition-colors ${
                          isSelected ? 'text-emerald-400' : 'text-gray-600'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>{progress.toFixed(1)}% complete</span>
                      <span>{formatCurrency(goal.targetAmount - goal.currentAmount)} remaining</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Score Panel */}
          <div className="space-y-4">
            {!selectedGoalId && (
              <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-6 text-center">
                <Calculator className="h-8 w-8 text-gray-600 mx-auto" />
                <p className="mt-3 text-sm text-gray-500">
                  Select a goal to view its achievability score and SIP projections.
                </p>
              </div>
            )}

            {selectedGoalId && scoreLoading && (
              <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-6 animate-pulse">
                <div className="h-20 bg-gray-800/50 rounded-xl mb-4" />
                <div className="h-12 bg-gray-800/50 rounded-lg mb-3" />
                <div className="h-12 bg-gray-800/50 rounded-lg" />
              </div>
            )}

            {selectedGoalId && !scoreLoading && scoreData && (
              <>
                {/* Achievability Score */}
                {score && bandConfig && (
                  <div className={`rounded-2xl border p-5 ${bandConfig.bg}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <bandConfig.icon className={`h-5 w-5 ${bandConfig.color}`} />
                        <span className={`text-sm font-semibold ${bandConfig.color}`}>
                          {bandConfig.label}
                        </span>
                      </div>
                      <div className={`text-3xl font-bold ${bandConfig.color}`}>
                        {score.score}
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="mt-3 h-2 rounded-full bg-gray-800/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${bandConfig.barColor}`}
                        style={{ width: `${score.score}%` }}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500">Required/month</span>
                        <div className="text-white font-semibold mt-0.5">
                          {formatCurrency(score.requiredMonthly)}
                        </div>
                      </div>
                      {score.estimatedMonthlyAvailable !== null && (
                        <div>
                          <span className="text-gray-500">Est. Available/month</span>
                          <div className="text-cyan-400 font-semibold mt-0.5">
                            {formatCurrency(score.estimatedMonthlyAvailable)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* What-If Sliders */}
                <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-5">
                  <h4 className="text-sm font-semibold text-white flex items-center space-x-2 mb-4">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    <span>What-If Simulator</span>
                  </h4>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Monthly SIP</span>
                        <span className="text-white font-medium">
                          {formatCurrency(whatIfContribution)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100000"
                        step="1000"
                        value={whatIfContribution}
                        onChange={(e) => setWhatIfContribution(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-700 accent-emerald-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">Expected Annual Return</span>
                        <span className="text-white font-medium">{whatIfReturn}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={whatIfReturn}
                        onChange={(e) => setWhatIfReturn(parseFloat(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-700 accent-cyan-500"
                      />
                      <p className="text-[10px] text-gray-600 mt-1">
                        ⚠ Return rate is an assumption, not a guarantee.
                      </p>
                    </div>
                  </div>
                </div>

                {/* SIP Projection */}
                {score?.sipProjection && (
                  <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-5">
                    <h4 className="text-sm font-semibold text-white flex items-center space-x-2 mb-3">
                      <Calculator className="h-4 w-4 text-emerald-400" />
                      <span>SIP Projection</span>
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500">Projected Corpus</span>
                        <div className="text-emerald-400 font-bold text-base mt-0.5">
                          {formatCurrency(score.sipProjection.projectedCorpus)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Invested</span>
                        <div className="text-white font-semibold mt-0.5">
                          {formatCurrency(score.sipProjection.totalInvested)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Interest Earned</span>
                        <div className="text-cyan-400 font-semibold mt-0.5">
                          {formatCurrency(score.sipProjection.interestEarned)}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">Annual Return</span>
                        <div className="text-white font-semibold mt-0.5">
                          {score.sipProjection.expectedAnnualReturn}%
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-[10px] text-gray-600 leading-relaxed">
                      {score.sipProjection.disclaimer}
                    </p>
                  </div>
                )}

                {/* Assumptions & Limitations */}
                {score && (
                  <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/60 p-5 text-xs">
                    <div className="flex items-center space-x-2 mb-2">
                      <Info className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-gray-400 font-medium">Methodology & Assumptions</span>
                    </div>
                    <ul className="space-y-1 text-gray-500">
                      {score.assumptions.map((a, i) => (
                        <li key={i} className="pl-3 border-l-2 border-gray-800">
                          {a}
                        </li>
                      ))}
                    </ul>
                    {score.limitations.length > 0 && (
                      <>
                        <div className="mt-2 text-gray-400 font-medium">Limitations</div>
                        <ul className="space-y-1 text-gray-500">
                          {score.limitations.map((l, i) => (
                            <li key={i} className="pl-3 border-l-2 border-amber-800/50">
                              {l}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {/* Unavailable state */}
                {!scoreData.available && (
                  <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-4 text-center text-xs text-gray-500">
                    {scoreData.reason || 'Scoring unavailable'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
