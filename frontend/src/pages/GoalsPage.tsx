import React from 'react';
import { Target, Calculator } from 'lucide-react';

export const GoalsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Savings Goals & SIP Simulator</h1>
        <p className="text-sm text-gray-400 mt-1">
          Goal achievability scoring and deterministic what-if compounding calculations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-6">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Target className="h-4 w-4 text-emerald-400" />
            <span>Target Achievability Score</span>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Scoring algorithm evaluates current surplus, historical volatility, and monthly commitment to provide a 0-100 achievability index.
          </p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-[#0e131d]/60 p-6">
          <div className="flex items-center space-x-2 text-sm font-semibold text-white">
            <Calculator className="h-4 w-4 text-cyan-400" />
            <span>Deterministic Math Simulator</span>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Compound interest and SIP inflation calculations are executed strictly in algorithmic code, not by the LLM.
          </p>
        </div>
      </div>
    </div>
  );
};
