import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ReceiptText,
  UploadCloud,
  TrendingUp,
  Target,
  BotMessageSquare,
  Sparkles,
  LogIn,
  AlertOctagon,
  Lightbulb,
  Compass,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface NavItem {
  name: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Transactions', to: '/transactions', icon: ReceiptText },
  { name: 'Import CSV', to: '/import', icon: UploadCloud },
  { name: 'Cash-Flow Forecast', to: '/forecast', icon: TrendingUp },
  { name: 'Goals & SIP Simulator', to: '/goals', icon: Target },
  { name: 'Anomalies', to: '/anomalies', icon: AlertOctagon },
  { name: 'Recommendations', to: '/recommendations', icon: Lightbulb },
  { name: 'AI Finance Assistant', to: '/chat', icon: BotMessageSquare, badge: 'RAG' },
  { name: 'System Tour', to: '/onboarding', icon: Compass },
  { name: 'Settings', to: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const { user, isAuthenticated } = useAuth();

  return (
    <aside className="w-64 border-r border-gray-800 bg-[#0e131d]/60 p-4 flex flex-col justify-between hidden md:flex">
      <div className="space-y-6">
        <div>
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Navigation
          </p>
          <nav className="mt-3 space-y-1" aria-label="Main Navigation">
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

      {/* User profile bottom bar */}
      <div className="border-t border-gray-800 pt-4">
        {isAuthenticated && user ? (
          <Link
            to="/settings"
            title="Open account settings"
            className="flex items-center space-x-3 px-2 py-1.5 rounded-xl hover:bg-gray-800/50 transition-colors group"
          >
            <div className="h-9 w-9 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-300 border border-emerald-500/30 group-hover:border-emerald-400 transition-colors">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-xs truncate flex-1">
              <p className="font-semibold text-gray-200 truncate group-hover:text-white">{user.name}</p>
              <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
              <span className="inline-block text-[10px] text-emerald-400/80 font-mono">
                {user.preferences?.currency || 'INR'} • {user.preferences?.dateFormat || 'DD/MM/YYYY'}
              </span>
            </div>
          </Link>
        ) : (
          <Link
            to="/login"
            className="flex items-center space-x-3 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800 hover:bg-gray-800/60 text-xs text-gray-300 transition-colors"
          >
            <LogIn className="h-4 w-4 text-emerald-400" />
            <div>
              <p className="font-medium text-white">Sign In</p>
              <p className="text-[10px] text-gray-400">Access your saved portfolio</p>
            </div>
          </Link>
        )}
      </div>
    </aside>
  );
};
