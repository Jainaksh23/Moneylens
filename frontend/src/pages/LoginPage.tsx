import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, Mail, Activity } from 'lucide-react';

export const LoginPage: React.FC = () => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-[#0e131d] p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Activity className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-white">Sign in to MoneyLens</h2>
          <p className="mt-1 text-xs text-gray-400">
            Secure authentication with httpOnly cookie sessions
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="block text-xs font-medium text-gray-300">Email Address</label>
            <div className="mt-1.5 relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                type="email"
                placeholder="demo@moneylens.in"
                className="w-full rounded-lg border border-gray-700 bg-gray-900/80 pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300">Password</label>
            <div className="mt-1.5 relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                type="password"
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-gray-700 bg-gray-900/80 pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-500 transition-colors"
          >
            Sign In (Phase 2 Auth)
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-emerald-400 hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
};
