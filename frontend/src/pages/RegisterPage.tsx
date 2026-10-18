import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Mail, User, Activity, AlertCircle, ArrowRight, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiClientError } from '../services/apiClient';

export const RegisterPage: React.FC = () => {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Password policy live criteria
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};

    if (!name.trim()) {
      errors.name = 'Full name is required';
    } else if (name.trim().length > 100) {
      errors.name = 'Name must be 100 characters or fewer';
    }

    if (!email.trim()) {
      errors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (!hasMinLength) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!hasLetter) {
      errors.password = 'Password must include at least one letter';
    } else if (!hasNumber) {
      errors.password = 'Password must include at least one number';
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
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
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
      } else {
        setServerError('Registration failed. Please check your network connection.');
      }
    } finally {
      setIsSubmitting(false);
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
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">Create an Account</h2>
          <p className="mt-1 text-xs text-gray-400">
            Start tracking your Indian Rupee cash-flow with AI decision support
          </p>
        </div>

        {/* Server Error Alert Banner */}
        {serverError && (
          <div className="mt-5 flex items-center space-x-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Form */}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="register-name" className="block text-xs font-medium text-gray-300">
              Full Name
            </label>
            <div className="mt-1.5 relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                disabled={isSubmitting}
                placeholder="Aarav Sharma"
                className={`w-full rounded-lg border bg-gray-900/80 pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:outline-none focus:ring-1 ${
                  fieldErrors.name
                    ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-gray-700 focus:border-emerald-500 focus:ring-emerald-500'
                }`}
              />
            </div>
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="register-email" className="block text-xs font-medium text-gray-300">
              Email Address
            </label>
            <div className="mt-1.5 relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
                disabled={isSubmitting}
                placeholder="aarav@example.com"
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
            <label htmlFor="register-password" className="block text-xs font-medium text-gray-300">
              Password
            </label>
            <div className="mt-1.5 relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="register-password"
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

            {/* Password Policy Helper Indicators */}
            <div className="mt-2.5 rounded-lg bg-gray-900/60 border border-gray-800 p-2.5 space-y-1.5 text-[11px]">
              <div className="flex items-center space-x-2">
                {hasMinLength ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <X className="h-3.5 w-3.5 text-gray-500" />
                )}
                <span className={hasMinLength ? 'text-emerald-400' : 'text-gray-400'}>
                  At least 8 characters
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {hasLetter ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <X className="h-3.5 w-3.5 text-gray-500" />
                )}
                <span className={hasLetter ? 'text-emerald-400' : 'text-gray-400'}>
                  At least one letter (a-z, A-Z)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {hasNumber ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <X className="h-3.5 w-3.5 text-gray-500" />
                )}
                <span className={hasNumber ? 'text-emerald-400' : 'text-gray-400'}>
                  At least one number (0-9)
                </span>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="block text-xs font-medium text-gray-300">
              Confirm Password
            </label>
            <div className="mt-1.5 relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                id="register-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword)
                    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }}
                disabled={isSubmitting}
                placeholder="••••••••••••"
                className={`w-full rounded-lg border bg-gray-900/80 pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 transition-colors focus:outline-none focus:ring-1 ${
                  fieldErrors.confirmPassword
                    ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500'
                    : 'border-gray-700 focus:border-emerald-500 focus:ring-emerald-500'
                }`}
              />
            </div>
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.confirmPassword}</p>
            )}
            {password && confirmPassword && (
              <p
                className={`mt-1 text-[11px] ${
                  passwordsMatch ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
              </p>
            )}
          </div>

          <button
            id="register-submit-button"
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 flex items-center justify-center space-x-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-emerald-400 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
