import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ReceiptText,
  TrendingUp,
  Target,
  BotMessageSquare,
  Sparkles,
} from 'lucide-react';

interface NavItem {
  name: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Transactions', to: '/transactions', icon: ReceiptText },
  { name: 'Cash-Flow Forecast', to: '/forecast', icon: TrendingUp },
  { name: 'Goals & SIP Simulator', to: '/goals', icon: Target },
  { name: 'AI Finance Assistant', to: '/chat', icon: BotMessageSquare, badge: 'RAG' },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 border-r border-gray-800 bg-[#0e131d]/60 p-4 flex flex-col justify-between hidden md:flex">
      <div className="space-y-6">
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Navigation
          </p>
          <nav className="mt-3 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                className={({ isActive }) =>
                  `group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                  }`
                }
              >
                <div className="flex items-center space-x-3">
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="inline-flex items-center rounded bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-800/40">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Intelligence Feature Badge Box */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400">
            <Sparkles className="h-4 w-4" />
            <span>AI Decision Support</span>
          </div>
          <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
            All forecasts & scores use deterministic logic. Insights are grounded in curated documents.
          </p>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <div className="flex items-center space-x-3 px-2">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-semibold text-emerald-300 border border-emerald-500/30">
            IN
          </div>
          <div className="text-xs">
            <p className="font-medium text-gray-200">Demo User</p>
            <p className="text-gray-500">demo@moneylens.in</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
