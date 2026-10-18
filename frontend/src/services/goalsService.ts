import { apiClient } from './apiClient';

export interface Goal {
  _id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  monthlyContribution?: number | null;
  expectedReturnRate?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  name: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate: string;
  priority?: 'high' | 'medium' | 'low';
  monthlyContribution?: number | null;
  expectedReturnRate?: number | null;
}

export interface UpdateGoalInput {
  name?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'active' | 'completed' | 'paused' | 'cancelled';
  monthlyContribution?: number | null;
  expectedReturnRate?: number | null;
}

export interface SIPProjection {
  monthlyContribution: number;
  expectedAnnualReturn: number;
  projectedCorpus: number;
  totalInvested: number;
  interestEarned: number;
  disclaimer: string;
}

export interface GoalScore {
  requiredMonthly: number;
  estimatedMonthlyAvailable: number | null;
  band: 'on_track' | 'needs_attention' | 'unlikely';
  score: number;
  sipProjection: SIPProjection | null;
  assumptions: string[];
  limitations: string[];
  methodology: string;
}

export interface GoalScoreResponse {
  available: boolean;
  reason?: string;
  goal: Goal;
  monthsLeft: number;
  score?: GoalScore;
}

export const goalsService = {
  listGoals: async (): Promise<{ goals: Goal[] }> => {
    return apiClient.get<{ goals: Goal[] }>('/goals');
  },

  createGoal: async (data: CreateGoalInput): Promise<{ goal: Goal }> => {
    return apiClient.post<{ goal: Goal }>('/goals', data);
  },

  updateGoal: async (id: string, data: UpdateGoalInput): Promise<{ goal: Goal }> => {
    return apiClient.patch<{ goal: Goal }>(`/goals/${id}`, data);
  },

  deleteGoal: async (id: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/goals/${id}`);
  },

  getScore: async (
    id: string,
    contribution?: number,
    annualReturn?: number,
  ): Promise<GoalScoreResponse> => {
    const params = new URLSearchParams();
    if (contribution !== undefined) params.set('contribution', String(contribution));
    if (annualReturn !== undefined) params.set('annualReturn', String(annualReturn));
    const qs = params.toString();
    return apiClient.get<GoalScoreResponse>(`/goals/${id}/score${qs ? `?${qs}` : ''}`);
  },
};
