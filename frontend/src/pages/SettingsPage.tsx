import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  User,
  Download,
  Trash2,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../services/userService';
import { useToast } from '../components/ui/Toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, refreshUser, logout, isLoading } = useAuth();
  const { success, error: toastError } = useToast();

  const [loadError, setLoadError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState<string>('');
  const [currency, setCurrency] = useState<string>('INR');
  const [dateFormat, setDateFormat] = useState<'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'>('DD/MM/YYYY');
  const [isSavingPrefs, setIsSavingPrefs] = useState<boolean>(false);

  // Modals
  const [showRerunModal, setShowRerunModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setCurrency(user.preferences?.currency || 'INR');
      setDateFormat(user.preferences?.dateFormat as any || 'DD/MM/YYYY');
    }
  }, [user]);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPrefs(true);
    try {
      await userService.updatePreferences({
        name,
        preferences: {
          currency,
          dateFormat,
        },
      });
      await refreshUser();
      success('Preferences Saved', 'Your profile and formatting preferences were updated.');
    } catch (err) {
      toastError(
        'Failed to Update Preferences',
        err instanceof Error ? err.message : 'Please check your inputs and try again.',
      );
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleExportCsv = () => {
    window.location.href = userService.exportDataCsvUrl();
    success('Export Started', 'Downloading your transaction records as CSV.');
  };

  const handleExportJson = () => {
    window.location.href = userService.exportDataJsonUrl();
    success('Export Started', 'Downloading your complete financial data bundle as JSON.');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE') return;

    setIsDeletingAccount(true);
    try {
      await userService.deleteAccount();
      await logout();
      navigate('/login');
    } catch (err) {
      toastError(
        'Failed to Delete Account',
        err instanceof Error ? err.message : 'An error occurred during account deletion.',
      );
      setIsDeletingAccount(false);
    }
  };

  if (!user && isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-4">
        <Skeleton variant="card" count={3} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <ErrorState
          title="Settings Unavailable"
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            refreshUser();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
          <Settings className="h-6 w-6 text-emerald-400" />
          <span>Account & Preferences</span>
        </h1>
        <p className="mt-1 text-xs text-gray-400">
          Manage your personal profile, currency/date formatting, zero-leakage privacy settings, and data exports.
        </p>
      </div>

      {/* 1. Profile & Preferences Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Profile & Region Preferences</CardTitle>
              <CardDescription>
                Customize your display name and localized financial formatting.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePreferences} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                required
              />

              <div className="space-y-1.5">
                <label htmlFor="profile-email" className="block text-xs font-semibold text-gray-300">
                  Email Address
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2 text-xs text-gray-400 cursor-not-allowed"
                />
                <span className="text-[10px] text-gray-500">
                  Email is locked to your authenticated session.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-800/60">
              {/* Currency */}
              <div className="space-y-1.5">
                <label htmlFor="currency-select" className="block text-xs font-semibold text-gray-300">
                  Operating Currency
                </label>
                <div className="relative">
                  <select
                    id="currency-select"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-xl border border-gray-800 bg-gray-900/80 px-3 py-2 text-xs text-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="INR">INR (₹) - Indian Rupee (Default)</option>
                  </select>
                </div>
                <p className="text-[10px] text-gray-500">
                  All cash-flow metrics, tax logic, and forecasts are optimized for INR.
                </p>
              </div>

              {/* Date Format */}
              <div className="space-y-1.5">
                <label htmlFor="date-format-select" className="block text-xs font-semibold text-gray-300">
                  Date Format
                </label>
                <div className="relative">
                  <select
                    id="date-format-select"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-800 bg-gray-900/80 px-3 py-2 text-xs text-white appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY (Standard Indian / British)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601 Standard)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                  </select>
                </div>
                <p className="text-[10px] text-gray-500">
                  Applied to transaction ledger tables and monthly cash-flow summaries.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSavingPrefs}
                leftIcon={<CheckCircle2 className="h-4 w-4" />}
              >
                Save Preferences
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 2. Privacy & Architecture Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Zero-Leakage Privacy Architecture</CardTitle>
              <CardDescription>
                How MoneyLens protects your financial isolation.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Embeddings-Free User Data Guarantee</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Your financial transactions, balances, and merchant records are <strong>never</strong> transformed into vector embeddings or stored in public vector stores. RAG context is queried on-demand and kept strictly in ephemeral memory for the duration of a single conversation turn.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl border border-gray-800 bg-gray-900/40 space-y-1">
              <div className="font-semibold text-white">HttpOnly Session Security</div>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                Tokens are stored in stateless, strict SameSite cookies. Never accessible to third-party JavaScript or localStorage attacks.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-gray-800 bg-gray-900/40 space-y-1">
              <div className="font-semibold text-white">Deterministic Logic Over LLMs</div>
              <p className="text-gray-400 text-[11px] leading-relaxed">
                Ledger summaries, monthly savings rates, and goal compound math use exact verified mathematics, preventing AI hallucinations.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-gray-800/60">
            <span className="text-xs text-gray-400">Need to review the introductory tour?</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRerunModal(true)}
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Re-run Onboarding Tour
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3. Data Portability & Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Data Portability & Export</CardTitle>
              <CardDescription>
                Download your complete financial records at any time.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/40 flex flex-col justify-between space-y-3">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center space-x-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  <span>Export Transactions (CSV)</span>
                </h4>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  Download a clean, UTF-8 CSV of all categorized transactions formatted for Excel, Google Sheets, or tax software.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                leftIcon={<Download className="h-3.5 w-3.5" />}
              >
                Download CSV
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/40 flex flex-col justify-between space-y-3">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center space-x-2">
                  <FileCode className="h-4 w-4 text-cyan-400" />
                  <span>Export Complete Bundle (JSON)</span>
                </h4>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  Full machine-readable backup containing profile, transactions, savings goals, anomalies, reminders, and chat logs.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportJson}
                leftIcon={<Download className="h-3.5 w-3.5" />}
              >
                Download JSON Bundle
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Danger Zone */}
      <Card className="border-rose-500/30 bg-rose-950/10">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-rose-400">Danger Zone: Permanent Account Erasure</CardTitle>
              <CardDescription>
                Permanently purge your account, financial transactions, insights, and credentials.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs text-rose-300/80 max-w-md leading-relaxed">
              Once initiated, all your transactions, goals, reminders, and conversation logs are permanently erased from our databases. This action is non-reversible.
            </p>
            <Button
              type="button"
              variant="danger"
              size="md"
              onClick={() => {
                setDeleteConfirmationText('');
                setShowDeleteModal(true);
              }}
              leftIcon={<Trash2 className="h-4 w-4" />}
            >
              Delete Account & Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Re-run Onboarding Confirmation Modal */}
      <Modal
        isOpen={showRerunModal}
        onClose={() => setShowRerunModal(false)}
        title="Re-run Onboarding Walkthrough?"
        description="Review system inputs, privacy policies, and calculation limits."
        maxWidth="md"
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setShowRerunModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setShowRerunModal(false);
                navigate('/onboarding');
              }}
            >
              Continue to Tour
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-300">
              <span className="font-semibold text-emerald-300">Zero Data Wipe Guarantee</span>
              <p className="mt-1 leading-relaxed">
                Re-running onboarding will <strong>NEVER</strong> delete, reset, or overwrite your existing transaction history, savings goals, or reminders. All existing data is strictly preserved.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Permanent Account Deletion Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Permanently Delete Account & Data?"
        description="This action cannot be undone."
        maxWidth="md"
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeletingAccount}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={deleteConfirmationText !== 'DELETE' || isDeletingAccount}
              isLoading={isDeletingAccount}
              onClick={handleDeleteAccount}
              leftIcon={<Trash2 className="h-4 w-4" />}
            >
              Permanently Purge Everything
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-rose-300">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <span>Full Cascade Purge Notice</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              This will permanently delete:
            </p>
            <ul className="text-xs text-rose-200/80 list-disc list-inside space-y-1">
              <li>All recorded financial transactions & imports</li>
              <li>All savings goals & SIP simulation records</li>
              <li>All detected anomalies & financial recommendations</li>
              <li>All recurring bills & payment reminders</li>
              <li>All conversation history with the AI Assistant</li>
              <li>Your user authentication profile & credentials</li>
            </ul>
          </div>

          <div className="space-y-2">
            <label htmlFor="delete-confirm-input" className="block text-xs font-medium text-gray-300">
              To proceed, please type <strong className="text-white font-mono">DELETE</strong> in capital letters below:
            </label>
            <Input
              id="delete-confirm-input"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              placeholder="Type DELETE to confirm"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
