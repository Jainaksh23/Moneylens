import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ReceiptText,
  Search,
  Plus,
  UploadCloud,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  AlertCircle,
  Copy,
  Tag,
  X,
} from 'lucide-react';
import { transactionService } from '../services/transactionService';
import type {
  TransactionItem,
  CreateTransactionPayload,
  UpdateTransactionPayload,
} from '../services/transactionService';

const CATEGORIES = [
  'All',
  'Food',
  'Groceries',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Entertainment',
  'Health',
  'Education',
  'Rent',
  'EMI/Loans',
  'Investments/SIP',
  'Travel',
  'Income',
  'Other',
  'unknown',
];

export const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<'all' | 'income' | 'expense'>('all');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSort, setSelectedSort] = useState('date:desc');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form states for Add / Edit
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]!);
  const [formAmount, setFormAmount] = useState('');
  const [formDirection, setFormDirection] = useState<'income' | 'expense'>('expense');
  const [formDescription, setFormDescription] = useState('');
  const [formMerchant, setFormMerchant] = useState('');
  const [formCategory, setFormCategory] = useState('Food');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await transactionService.getTransactions({
        page,
        pageSize,
        direction: selectedDirection === 'all' ? undefined : selectedDirection,
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        q: searchQuery.trim() || undefined,
        sort: selectedSort,
        needsReview: needsReviewOnly ? true : undefined,
      });
      setTransactions(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : 'Failed to retrieve transactions from server',
      );
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, selectedDirection, selectedCategory, searchQuery, selectedSort, needsReviewOnly]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTransactions();
  };

  const openAddModal = () => {
    setFormDate(new Date().toISOString().split('T')[0]!);
    setFormAmount('');
    setFormDirection('expense');
    setFormDescription('');
    setFormMerchant('');
    setFormCategory('Food');
    setFormError(null);
    setShowAddModal(true);
  };

  const openEditModal = (t: TransactionItem) => {
    setEditingTransaction(t);
    setFormDate(new Date(t.date).toISOString().split('T')[0]!);
    setFormAmount(String(t.amount));
    setFormDirection(t.direction);
    setFormDescription(t.description);
    setFormMerchant(t.merchant === 'unknown' ? '' : t.merchant);
    setFormCategory(t.category);
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAmount || parseFloat(formAmount) <= 0) {
      setFormError('Please enter a valid positive amount');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('Description is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const payload: CreateTransactionPayload = {
        date: formDate,
        amount: parseFloat(formAmount),
        direction: formDirection,
        description: formDescription.trim(),
        merchant: formMerchant.trim() || 'unknown',
        category: formCategory,
      };
      await transactionService.createTransaction(payload);
      setShowAddModal(false);
      fetchTransactions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      const payload: UpdateTransactionPayload = {
        date: formDate,
        amount: parseFloat(formAmount),
        direction: formDirection,
        description: formDescription.trim(),
        merchant: formMerchant.trim() || 'unknown',
        category: formCategory,
      };
      await transactionService.updateTransaction(editingTransaction.id, payload);
      setEditingTransaction(null);
      fetchTransactions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await transactionService.deleteTransaction(id);
      fetchTransactions();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete transaction');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <ReceiptText className="h-6 w-6 text-emerald-400" />
            <span>Transactions & Ledger</span>
          </h1>
          <p className="mt-1 text-xs text-gray-400">
            View, filter, edit, and organize all your Indian Rupee cash inflows and outflows.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/import"
            className="inline-flex items-center space-x-1.5 rounded-lg border border-gray-700 bg-gray-900/80 px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:border-gray-600 transition-colors shadow-sm"
          >
            <UploadCloud className="h-4 w-4 text-emerald-400" />
            <span>Import CSV</span>
          </Link>

          <button
            onClick={openAddModal}
            className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Add Manual</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-4 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
            <input
              type="text"
              aria-label="Search transactions"
              placeholder="Search description, merchant (e.g. Swiggy, Zepto, Salary)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900/80 pl-10 pr-4 py-2 text-xs text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Direction Filter */}
          <div className="flex rounded-lg border border-gray-700 bg-gray-900/80 p-0.5 text-xs">
            {(['all', 'expense', 'income'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => {
                  setSelectedDirection(dir);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md font-medium capitalize transition-colors ${
                  selectedDirection === dir
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          {/* Needs Review Filter Toggle */}
          <button
            type="button"
            onClick={() => {
              setNeedsReviewOnly(!needsReviewOnly);
              setPage(1);
            }}
            className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
              needsReviewOnly
                ? 'border-amber-500/70 bg-amber-500/15 text-amber-300 font-semibold shadow-sm ring-1 ring-amber-500/30'
                : 'border-gray-700 bg-gray-900/80 text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <AlertCircle className={`h-3.5 w-3.5 ${needsReviewOnly ? 'text-amber-400' : 'text-gray-500'}`} />
            <span>Needs Review</span>
          </button>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-xs text-gray-200 focus:border-emerald-500 focus:outline-none"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                Category: {cat}
              </option>
            ))}
          </select>

          {/* Sort Dropdown */}
          <select
            value={selectedSort}
            onChange={(e) => {
              setSelectedSort(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-xs text-gray-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="date:desc">Newest First</option>
            <option value="date:asc">Oldest First</option>
            <option value="amount:desc">Highest Amount</option>
            <option value="amount:asc">Lowest Amount</option>
          </select>
        </form>
      </div>

      {/* Main Table & States */}
      <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-800/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : fetchError ? (
          <div className="p-12 text-center space-y-3">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <p className="text-sm font-semibold text-rose-300">Failed to load transactions</p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">{fetchError}</p>
            <button
              onClick={fetchTransactions}
              className="mt-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Retry Connection
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-16 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/60 text-gray-400">
              <ReceiptText className="h-7 w-7" />
            </div>
            <div>
              <p className="text-base font-semibold text-white">No transactions found</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                No records match your selected filters. Try clearing filters or upload a bank statement CSV to populate your data.
              </p>
            </div>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <Link
                to="/import"
                className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Upload Statement</span>
              </Link>
              <button
                onClick={openAddModal}
                className="inline-flex items-center space-x-1.5 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-2 text-xs font-medium text-gray-300 hover:text-white"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Entry</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-gray-900/70 border-b border-gray-800 text-[11px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description & Merchant</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount (₹)</th>
                  <th className="px-4 py-3 text-center">Source</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-sans">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-900/40 transition-colors">
                    <td className="px-4 py-3.5 whitespace-nowrap text-gray-300 font-mono text-[11px]">
                      {new Date(tx.date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-4 py-3.5 max-w-xs sm:max-w-md">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-100 truncate block">
                          {tx.description}
                        </span>
                        {tx.isDuplicate && (
                          <span
                            className="inline-flex items-center space-x-0.5 rounded bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-semibold text-amber-400 border border-amber-500/30"
                            title="Flagged duplicate fingerprint"
                          >
                            <Copy className="h-2.5 w-2.5" />
                            <span>Duplicate</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-500 block capitalize">
                        {tx.merchant !== 'unknown' ? tx.merchant : 'No merchant specified'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="inline-flex items-center space-x-1 rounded-md bg-gray-800/90 px-2 py-0.5 text-[11px] font-medium text-emerald-300 border border-gray-700/60">
                            <Tag className="h-3 w-3 text-emerald-400" />
                            <span>{tx.category}</span>
                          </span>

                          {/* Confidence badge */}
                          {tx.categoryConfidence != null && tx.categoryConfidence > 0 && (
                            <span
                              className={`text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded border ${
                                tx.categoryConfidence >= 0.8
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : tx.categoryConfidence >= 0.55
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              }`}
                              title={`Model Confidence: ${(tx.categoryConfidence * 100).toFixed(1)}% (${tx.modelVersion || 'ML'})`}
                            >
                              {Math.round(tx.categoryConfidence * 100)}%
                            </span>
                          )}

                          {/* Source tag */}
                          {tx.categorySource === 'user' && (
                            <span
                              className="text-[9px] text-indigo-400 font-semibold px-1 rounded bg-indigo-500/10 border border-indigo-500/30"
                              title="Edited by user (Human feedback stored)"
                            >
                              User
                            </span>
                          )}
                          {tx.categorySource === 'model' && (
                            <span
                              className="text-[9px] text-purple-400 font-semibold px-1 rounded bg-purple-500/10 border border-purple-500/30"
                              title={`Predicted by ML categorizer ${tx.modelVersion || ''}`}
                            >
                              AI
                            </span>
                          )}
                          {tx.categorySource === 'rule' && (
                            <span
                              className="text-[9px] text-gray-400 font-semibold px-1 rounded bg-gray-800/60 border border-gray-700/40"
                              title="Inferred by keyword rules"
                            >
                              Rule
                            </span>
                          )}
                        </div>

                        {/* Review Alert Banner */}
                        {tx.needsReview && (
                          <div className="flex items-center space-x-1">
                            <span className="inline-flex items-center space-x-0.5 text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1 rounded">
                              <AlertCircle className="h-2.5 w-2.5" />
                              <span>Needs Review</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td
                      className={`px-4 py-3.5 text-right font-mono font-semibold whitespace-nowrap ${
                        tx.direction === 'income' ? 'text-emerald-400' : 'text-gray-100'
                      }`}
                    >
                      {tx.direction === 'income' ? '+ ' : '- '}₹
                      {tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <span className="uppercase text-[9px] font-semibold tracking-wider text-gray-400 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-800">
                        {tx.source}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={() => openEditModal(tx)}
                        className="text-gray-400 hover:text-emerald-400 p-1 rounded hover:bg-gray-800 transition-colors"
                        title="Edit or recategorize"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        disabled={deletingId === tx.id}
                        className="text-gray-400 hover:text-rose-400 p-1 rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
                        title="Delete transaction"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!isLoading && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-800 px-4 py-3 text-xs text-gray-400 gap-2">
            <div>
              Showing <span className="font-semibold text-white">{(page - 1) * pageSize + 1}</span>{' '}
              to <span className="font-semibold text-white">{Math.min(page * pageSize, total)}</span>{' '}
              of <span className="font-semibold text-white">{total}</span> transactions
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center space-x-1 rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Prev</span>
              </button>

              <span className="px-2 font-mono text-gray-300">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center space-x-1 rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Transaction Modal */}
      {(showAddModal || editingTransaction) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-[#0e131d] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingTransaction ? 'Edit / Recategorize Transaction' : 'Add Manual Transaction'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingTransaction(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            <form
              onSubmit={editingTransaction ? handleUpdateSubmit : handleCreateSubmit}
              className="space-y-3.5 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-gray-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Direction</label>
                  <select
                    value={formDirection}
                    onChange={(e) => setFormDirection(e.target.value as 'income' | 'expense')}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-gray-200 focus:border-emerald-500 focus:outline-none capitalize"
                  >
                    <option value="expense">Expense (Outflow)</option>
                    <option value="income">Income (Inflow)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Amount (₹ INR)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 450.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-gray-200 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Swiggy food delivery, Monthly Salary"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-gray-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Merchant (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Swiggy, Amazon"
                    value={formMerchant}
                    onChange={(e) => setFormMerchant(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-gray-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-gray-200 focus:border-emerald-500 focus:outline-none"
                  >
                    {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingTransaction(null);
                  }}
                  className="rounded-lg border border-gray-700 px-4 py-2 font-medium text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingTransaction ? 'Save Changes' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
