import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  ReceiptText,
  UploadCloud,
  TrendingUp,
  Target,
  BotMessageSquare,
  AlertOctagon,
  Lightbulb,
  Compass,
  Settings,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';

const mobileNavLinks = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Transactions', to: '/transactions', icon: ReceiptText },
  { name: 'Import CSV', to: '/import', icon: UploadCloud },
  { name: 'Cash-Flow Forecast', to: '/forecast', icon: TrendingUp },
  { name: 'Goals & Simulator', to: '/goals', icon: Target },
  { name: 'Anomalies', to: '/anomalies', icon: AlertOctagon },
  { name: 'Recommendations', to: '/recommendations', icon: Lightbulb },
  { name: 'AI Assistant', to: '/chat', icon: BotMessageSquare },
  { name: 'System Tour', to: '/onboarding', icon: Compass },
  { name: 'Settings', to: '/settings', icon: Settings },
];

export const Navbar: React.FC = () => {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'waking_up' | 'online' | 'offline'>('checking');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let isMounted = true;
    let consecutiveFailures = 0;

    const check = async () => {
      try {
        const res = await apiClient.checkHealth();
        if (isMounted) {
          if (res.status === 'ok') {
            setBackendStatus('online');
            consecutiveFailures = 0;
          } else {
            setBackendStatus('waking_up');
          }
        }
      } catch {
        if (isMounted) {
          consecutiveFailures++;
          // First few retries show waking up state (Render cold-start handling)
          if (consecutiveFailures <= 4) {
            setBackendStatus('waking_up');
          } else {
            setBackendStatus('offline');
          }
        }
      }
    };

    check();
    const interval = setInterval(check, backendStatus === 'waking_up' ? 6000 : 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [backendStatus]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setIsLoggingOut(false);
      setMobileMenuOpen(false);
    }
  };

  return (
    <>
      {backendStatus === 'waking_up' && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-200 flex items-center justify-center space-x-2 text-center">
          <Activity className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
          <span>
            <strong>Cloud Service Waking Up:</strong> Render free instances sleep after inactivity and take ~30–50s to resume. Real-time financial services will be ready momentarily.
          </span>
        </div>
      )}
      <header className="sticky top-0 z-40 w-full border-b border-gray-800 bg-[#0b0f17]/90 backdrop-blur-md">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand & Mobile Hamburger */}
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <Link to="/" className="flex items-center space-x-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Activity className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                Money<span className="text-emerald-400">Lens</span>
              </span>
            </Link>
            <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              INR ₹ Edition
            </span>
          </div>

          {/* Right Controls & Status Indicator */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Health Status Indicator */}
            <div
              className={`flex items-center space-x-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                backendStatus === 'online'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                  : backendStatus === 'waking_up'
                  ? 'bg-amber-950/50 text-amber-300 border-amber-700/80 animate-pulse'
                  : backendStatus === 'checking'
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                  : 'bg-rose-950/40 text-rose-400 border-rose-800/60'
              }`}
              title={
                backendStatus === 'waking_up'
                  ? 'Cloud backend service is waking up from sleep...'
                  : `Backend Gateway: ${backendStatus}`
              }
              role="status"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  backendStatus === 'online'
                    ? 'bg-emerald-400 animate-pulse'
                    : backendStatus === 'waking_up'
                    ? 'bg-amber-400 animate-ping'
                    : backendStatus === 'checking'
                    ? 'bg-amber-400'
                    : 'bg-rose-400'
                }`}
              />
              <span className="capitalize hidden xs:inline">
                {backendStatus === 'online'
                  ? 'Gateway Live'
                  : backendStatus === 'waking_up'
                  ? 'Waking Up Service...'
                  : backendStatus}
              </span>
            </div>

            {/* User Auth Section */}
            {isAuthenticated && user ? (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Link
                  to="/settings"
                  className="flex items-center space-x-2 pl-2 border-l border-gray-800 hover:opacity-80 transition-opacity"
                  title="View Profile & Settings"
                >
                  <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-300 border border-emerald-500/30">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden lg:block text-left text-xs">
                    <p className="font-semibold text-gray-200">{user.name}</p>
                    <p className="text-[10px] text-gray-500">{user.email}</p>
                  </div>
                </Link>

                <button
                  id="logout-button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center space-x-1.5 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white hover:border-gray-700 hover:bg-gray-800/80 transition-colors disabled:opacity-50"
                  title="Log out securely"
                >
                  <LogOut className="h-3.5 w-3.5 text-gray-400" />
                  <span className="hidden sm:inline">
                    {isLoggingOut ? 'Leaving...' : 'Sign Out'}
                  </span>
                </button>
              </div>
            ) : location.pathname !== '/login' && location.pathname !== '/register' ? (
              <div className="flex items-center space-x-2">
                <Link
                  to="/login"
                  className="text-xs font-medium text-gray-300 hover:text-white px-3 py-1.5 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center space-x-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
                >
                  <span>Get Started</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Mobile Off-Canvas Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-[#0e131d] border-r border-gray-800 p-5 flex flex-col justify-between shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <div className="flex items-center space-x-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <Activity className="h-4 w-4" />
                  </div>
                  <span className="text-base font-bold text-white">MoneyLens</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="space-y-1">
                {mobileNavLinks.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.name}</span>
                  </NavLink>
                ))}
              </nav>
            </div>

            {/* Bottom Section */}
            <div className="pt-4 border-t border-gray-800">
              {isAuthenticated && user ? (
                <div className="space-y-3">
                  <div className="flex items-center space-x-3 px-2">
                    <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs font-bold text-emerald-300">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-xs truncate">
                      <p className="font-semibold text-gray-200 truncate">{user.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center space-x-2 rounded-xl bg-gray-900 border border-gray-800 py-2 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center space-x-2 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
                >
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
