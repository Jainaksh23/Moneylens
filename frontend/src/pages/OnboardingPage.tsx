import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  UploadCloud,
  LayoutDashboard,
  Receipt,
  Sparkles,
  Info,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [showRerunModal, setShowRerunModal] = useState<boolean>(false);
  const [hasCompletedBefore, setHasCompletedBefore] = useState<boolean>(false);

  useEffect(() => {
    const isCompleted = localStorage.getItem('moneylens_onboarding_completed');
    if (isCompleted === 'true') {
      setHasCompletedBefore(true);
      setShowRerunModal(true);
    }
  }, []);

  const handleFinishOnboarding = () => {
    localStorage.setItem('moneylens_onboarding_completed', 'true');
    navigate('/');
  };

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to MoneyLens',
      subtitle: 'Your intelligent, privacy-first personal financial copilot tailored for INR ₹.',
      icon: <Compass className="h-8 w-8 text-emerald-400" />,
    },
    {
      id: 'inputs',
      title: 'Supported Financial Inputs',
      subtitle: 'Easily bring in your transactions from banks, receipts, or manual entries.',
      icon: <FileSpreadsheet className="h-8 w-8 text-cyan-400" />,
    },
    {
      id: 'privacy',
      title: 'Zero-Leakage Privacy Sandbox',
      subtitle: 'Your personal financial details are NEVER stored in AI embeddings or shared.',
      icon: <ShieldCheck className="h-8 w-8 text-emerald-400" />,
    },
    {
      id: 'limits',
      title: 'Limits & Guardrails of AI Insights',
      subtitle: 'Understand how our deterministic calculations and advisory models work.',
      icon: <AlertTriangle className="h-8 w-8 text-amber-400" />,
    },
    {
      id: 'complete',
      title: 'You Are All Set!',
      subtitle: 'Choose where you would like to begin your financial journey.',
      icon: <Sparkles className="h-8 w-8 text-emerald-400" />,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      {/* Re-running Confirmation Modal */}
      <Modal
        isOpen={showRerunModal}
        onClose={() => {
          setShowRerunModal(false);
          navigate('/');
        }}
        title="Re-run Onboarding Walkthrough?"
        description="Reviewing our setup guide and policies."
        maxWidth="md"
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setShowRerunModal(false);
                navigate('/');
              }}
            >
              Return to Dashboard
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setShowRerunModal(false);
                setCurrentStep(0);
              }}
            >
              Proceed With Walkthrough
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-start space-x-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-300">
              <span className="font-semibold text-emerald-300">
                Your existing data is 100% safe.
              </span>
              <p className="mt-1 leading-relaxed">
                Re-running the onboarding tour will <strong>NEVER</strong> reset, modify, or
                silently wipe your recorded transactions, savings goals, or analytics history. All
                your financial records are strictly preserved.
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            You can re-read the supported bank input formats, review our privacy architecture, or
            learn about insight limits.
          </p>
        </div>
      </Modal>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Badge variant="emerald">Getting Started</Badge>
            {hasCompletedBefore && (
              <span className="text-[11px] text-gray-500 flex items-center space-x-1">
                <RotateCcw className="h-3 w-3" />
                <span>Tour Mode (Safe • Zero Data Wipe)</span>
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            System Guide & Architecture
          </h1>
        </div>

        {/* Step indicator */}
        <div className="text-xs text-gray-400">
          Step <span className="font-bold text-emerald-400">{currentStep + 1}</span> of{' '}
          {steps.length}
        </div>
      </div>

      {/* Step Progress Bar */}
      <div className="grid grid-cols-5 gap-2" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={steps.length}>
        {steps.map((s, idx) => (
          <div
            key={s.id}
            onClick={() => setCurrentStep(idx)}
            className={`h-1.5 rounded-full cursor-pointer transition-all ${
              idx <= currentStep ? 'bg-emerald-500' : 'bg-gray-800'
            }`}
            title={`Step ${idx + 1}: ${s.title}`}
          />
        ))}
      </div>

      {/* Step Content Card */}
      <Card>
        <CardContent className="p-6 sm:p-8 space-y-6">
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              <div className="flex items-center space-x-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  {steps[0].icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{steps[0].title}</h2>
                  <p className="text-xs text-gray-400 mt-1">{steps[0].subtitle}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm">
                    ₹
                  </div>
                  <h3 className="text-xs font-bold text-white">INR Native Calculations</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Built specifically for Indian financial flows: UPI, NEFT, IMPS, SIPs, and Lakhs/Crores formatting.
                  </p>
                </div>

                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-sm">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <h3 className="text-xs font-bold text-white">Zero Vector Embeddings</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Your transactions are strictly shielded. We never store personal balances in vector stores.
                  </p>
                </div>

                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-2">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-sm">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <h3 className="text-xs font-bold text-white">Deterministic Insights</h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Cash-flow trends, savings rates, and SIP goals use verified mathematical formulas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Supported Inputs */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              <div className="flex items-center space-x-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
                  {steps[1].icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{steps[1].title}</h2>
                  <p className="text-xs text-gray-400 mt-1">{steps[1].subtitle}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
                  <h3 className="text-xs font-bold text-white flex items-center space-x-2">
                    <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
                    <span>1. Bank Statement CSVs (Auto-Detected Formats)</span>
                  </h3>
                  <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                    Directly upload statement CSVs from major banks (HDFC, State Bank of India, ICICI, Axis, Kotak) or standard sheets. Required columns:
                  </p>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                    <div className="bg-gray-800/80 p-2 rounded-lg font-mono text-gray-200">
                      Date (DD/MM/YYYY)
                    </div>
                    <div className="bg-gray-800/80 p-2 rounded-lg font-mono text-gray-200">
                      Amount (Positive INR)
                    </div>
                    <div className="bg-gray-800/80 p-2 rounded-lg font-mono text-gray-200">
                      Direction (income/expense)
                    </div>
                    <div className="bg-gray-800/80 p-2 rounded-lg font-mono text-gray-200">
                      Description / Merchant
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
                    <h3 className="text-xs font-bold text-white flex items-center space-x-2">
                      <Receipt className="h-4 w-4 text-emerald-400" />
                      <span>2. Manual Ledger Records</span>
                    </h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Add instant records from the Transactions page for cash expenses, ATM withdrawals, or personal peer-to-peer transfers.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
                    <h3 className="text-xs font-bold text-white flex items-center space-x-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span>3. ML Category Auto-Enrichment</span>
                    </h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Merchants like Swiggy, Netflix, Uber, or Cred are automatically classified into Food, Utilities, Entertainment, and more.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Privacy */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              <div className="flex items-center space-x-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  {steps[2].icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{steps[2].title}</h2>
                  <p className="text-xs text-gray-400 mt-1">{steps[2].subtitle}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-start space-x-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-300 space-y-1">
                    <h4 className="font-bold text-emerald-300">No Vector Embeddings of Financial Data</h4>
                    <p className="leading-relaxed">
                      Unlike other AI financial apps that convert your bank statements into searchable vector embeddings, MoneyLens maintains a strict <strong>zero-leakage sandbox</strong>. Your transaction history is never stored in vector databases (ChromaDB).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-1.5">
                    <h4 className="text-xs font-bold text-white">Strict Tenant Isolation</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      All database queries enforce strict user ID matching. Other accounts can never view or calculate against your data.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-1.5">
                    <h4 className="text-xs font-bold text-white">Full Right to Erasure</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      You can download all your data as a CSV or permanently delete your entire account with cascade purge from the Settings screen.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Limits of Insights */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              <div className="flex items-center space-x-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30">
                  {steps[3].icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{steps[3].title}</h2>
                  <p className="text-xs text-gray-400 mt-1">{steps[3].subtitle}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 flex items-start space-x-3">
                  <Info className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-300 space-y-1">
                    <h4 className="font-bold text-amber-300">Decision Support, Not Certified Advice</h4>
                    <p className="leading-relaxed">
                      MoneyLens provides mathematical decision support and informational insights based on your transaction history. It does <strong>not</strong> constitute SEBI-registered investment advisory, formal tax advice, or audit certifications.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-1.5">
                    <h4 className="text-xs font-bold text-white">Deterministic Compounding</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Goal probabilities and SIP timelines are computed through deterministic compounding formulas based on the rates you define, not speculative market forecasts.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-1.5">
                    <h4 className="text-xs font-bold text-white">Anomalies are Advisory</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Unusual spending flags are based on deviation from historical standard deviation. They highlight unexpected amounts, not confirmed fraud.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Ready / Finish */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              <div className="flex items-center space-x-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  {steps[4].icon}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{steps[4].title}</h2>
                  <p className="text-xs text-gray-400 mt-1">{steps[4].subtitle}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('moneylens_onboarding_completed', 'true');
                    navigate('/import');
                  }}
                  className="p-5 rounded-2xl border border-gray-800 bg-gray-900/60 hover:border-emerald-500/40 hover:bg-gray-800/60 text-left transition-all space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-emerald-400 transition-colors" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Import Bank Statement</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Upload your CSV file to auto-categorize months of transactions in seconds.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('moneylens_onboarding_completed', 'true');
                    navigate('/');
                  }}
                  className="p-5 rounded-2xl border border-gray-800 bg-gray-900/60 hover:border-emerald-500/40 hover:bg-gray-800/60 text-left transition-all space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20">
                      <LayoutDashboard className="h-5 w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Explore Dashboard</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Check cash-flow trends, savings rate meters, and financial health scorecards.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-800">
            <Button
              variant="outline"
              size="md"
              disabled={currentStep === 0}
              onClick={() => setCurrentStep((prev: number) => Math.max(0, prev - 1))}
              leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
            >
              Previous
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => setCurrentStep((prev: number) => Math.min(steps.length - 1, prev + 1))}
                rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Next Step
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleFinishOnboarding}
                rightIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
              >
                Complete Onboarding
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
