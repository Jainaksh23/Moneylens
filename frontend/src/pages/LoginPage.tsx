import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, Activity, AlertCircle, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../services/apiClient';
import { authService } from '../services/authService';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, sessionExpired, dismissSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  // If already authenticated, redirect to destination
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Unable to sign in. Please verify your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setIsForgotSubmitting(true);
    try {
      const res = await authService.forgotPassword(forgotEmail.trim());
      setForgotMessage(res.message);
    } catch {
      setForgotMessage(
        'If an account with that email exists, a password reset link has been sent.',
      );
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-[#0e131d]/90 backdrop-blur-xl p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-inner">
            <Activity className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">Sign In to MoneyLens</h2>
          <p className="mt-1 text-xs text-gray-400">
            Personal financial intelligence for INR users • Final-Year Project
          </p>
        </div>

        {/* Session Expired Alert Banner */}
        {sessionExpired && (
          <div className="mt-5 flex items-start space-x-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <div className="flex-1">
              <span className="font-semibold">Session Expired:</span> Your session has ended for security. Please sign in again.
            </div>
            <button
              onClick={dismissSessionExpired}
              className="text-amber-400 hover:text-amber-200 text-xs font-semibold"
            >
              ×
            </button>
          </div>
        )}

        {/* Server Error Alert Banner */}
        {serverError && (
          <div className="mt-5 flex items-center space-x-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Login Form */}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-gray-300">
              Email Address
            </label>
            <div className="mt-1.5 relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                disabled={isSubmitting}
                placeholder="name@example.com"
                className={`w-full rounded-lg border bg-gray-900/80 pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:outline-none focus:ring-1 ${
                  fieldErrors.email
                    ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-gray-700 focus:border-emerald-500 focus:ring-emerald-500'
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="block text-xs font-medium text-gray-300">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotMessage(null);
                  setForgotEmail(email);
                  setShowForgotModal(true);
                }}
                className="text-xs text-emerald-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="mt-1.5 relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password)
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
                disabled={isSubmitting}
                placeholder="••••••••••••"
                className={`w-full rounded-lg border bg-gray-900/80 pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:outline-none focus:ring-1 ${
                  fieldErrors.password
                    ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-gray-700 focus:border-emerald-500 focus:ring-emerald-500'
                }`}
              />
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.password}</p>
            )}
          </div>

          <button
            id="login-submit-button"
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 flex items-center justify-center space-x-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Security Assurance Footer */}
        <div className="mt-6 rounded-lg bg-gray-900/40 border border-gray-800/60 p-3 text-center">
          <p className="text-[11px] text-gray-400">
            🔒 Protected by <strong className="text-gray-300">httpOnly Lax cookie</strong>. No auth tokens in localStorage.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-emerald-400 font-semibold hover:underline">
            Register here
          </Link>
        </p>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-[#0e131d] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Reset Password</h3>
            <p className="mt-1 text-xs text-gray-400">
              Enter your email address and we'll send a password reset link.
            </p>

            {forgotMessage ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300 flex items-start space-x-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                <span>{forgotMessage}</span>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="mt-4 space-y-3">
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isForgotSubmitting}
                  className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {isForgotSubmitting ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <button
              onClick={() => setShowForgotModal(false)}
              className="mt-4 w-full text-center text-xs text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
