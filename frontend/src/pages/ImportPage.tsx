import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { transactionService } from '../services/transactionService';
import type { CsvPreviewResponse } from '../services/transactionService';

export const ImportPage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<CsvPreviewResponse | null>(null);

  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'accepted' | 'duplicates' | 'rejected'>('accepted');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setUploadError('Only CSV files (.csv) are supported');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError('File size exceeds the 5MB maximum limit');
        return;
      }
      setSelectedFile(file);
      setUploadError(null);
      setPreviewData(null);
      setConfirmSuccess(null);
    }
  };

  const handleUploadAndPreview = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const preview = await transactionService.uploadCsvPreview(selectedFile);
      setPreviewData(preview);
      if (preview.counts.accepted > 0) {
        setActiveTab('accepted');
      } else if (preview.counts.duplicates > 0) {
        setActiveTab('duplicates');
      } else {
        setActiveTab('rejected');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse and preview CSV');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewData) return;

    setIsConfirming(true);
    try {
      const res = await transactionService.confirmImport(
        previewData.importJobId,
        includeDuplicates,
      );
      setConfirmSuccess(res.importedCount);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to finalize import');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = transactionService.downloadTemplateUrl();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <FileSpreadsheet className="h-6 w-6 text-emerald-400" />
            <span>Import Bank Statement CSV</span>
          </h1>
          <p className="mt-1 text-xs text-gray-400">
            Upload your Indian bank or UPI statement. Two-step preview validates rows and flags duplicate transactions.
          </p>
        </div>

        <button
          onClick={handleDownloadTemplate}
          className="inline-flex items-center space-x-2 rounded-lg border border-gray-700 bg-gray-900/80 px-3.5 py-2 text-xs font-semibold text-gray-200 hover:text-white hover:border-gray-600 transition-colors shadow-sm"
        >
          <Download className="h-4 w-4 text-emerald-400" />
          <span>Download CSV Template</span>
        </button>
      </div>

      {/* Confirmation Success View */}
      {confirmSuccess !== null ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Import Complete!</h2>
          <p className="text-sm text-gray-300 max-w-md mx-auto">
            Successfully imported <strong className="text-emerald-400">{confirmSuccess}</strong> transactions into your MoneyLens account.
          </p>
          <div className="flex items-center justify-center space-x-4 pt-2">
            <Link
              to="/transactions"
              className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-500 transition-colors"
            >
              <span>View Transactions</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={() => {
                setSelectedFile(null);
                setPreviewData(null);
                setConfirmSuccess(null);
              }}
              className="inline-flex items-center space-x-1.5 rounded-lg border border-gray-700 bg-gray-900/80 px-4 py-2.5 text-sm font-medium text-gray-300 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Import Another File</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* File Upload Box */}
          <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-6 space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-700 hover:border-emerald-500/60 rounded-xl p-8 text-center cursor-pointer transition-colors bg-gray-900/40"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-gray-200">
                {selectedFile ? (
                  <span className="text-emerald-400 font-semibold">{selectedFile.name}</span>
                ) : (
                  'Click to choose a CSV file or drag and drop here'
                )}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Standard format: date, description, amount, type (debit/credit), merchant • Max 5MB
              </p>
            </div>

            {/* Error Banner */}
            {uploadError && (
              <div className="flex items-center space-x-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
                <XCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Upload Action */}
            {selectedFile && !previewData && (
              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  id="preview-csv-button"
                  type="button"
                  onClick={handleUploadAndPreview}
                  disabled={isUploading}
                  className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Parsing & Validating...</span>
                    </>
                  ) : (
                    <>
                      <span>Inspect & Preview</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Preview Results Section */}
          {previewData && (
            <div className="rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-6 space-y-6">
              {/* Summary Metrics */}
              <div>
                <h2 className="text-base font-semibold text-white">Import Preview Summary</h2>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                    <p className="text-xs text-gray-400">Total Rows Evaluated</p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {previewData.counts.totalRows}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-emerald-300">Accepted (Ready)</p>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-emerald-400">
                      {previewData.counts.accepted}
                    </p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-amber-300">Duplicate Candidates</p>
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-amber-400">
                      {previewData.counts.duplicates}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-rose-300">Rejected (Errors)</p>
                      <XCircle className="h-4 w-4 text-rose-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-rose-400">
                      {previewData.counts.rejected}
                    </p>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-gray-800 space-x-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('accepted')}
                  className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 ${
                    activeTab === 'accepted'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Accepted Sample ({previewData.counts.accepted})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('duplicates')}
                  className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 ${
                    activeTab === 'duplicates'
                      ? 'border-amber-500 text-amber-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Duplicate Candidates ({previewData.counts.duplicates})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rejected')}
                  className={`pb-2.5 text-xs font-semibold transition-colors border-b-2 ${
                    activeTab === 'rejected'
                      ? 'border-rose-500 text-rose-400'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Rejection Reasons ({previewData.counts.rejected})
                </button>
              </div>

              {/* Tab Contents */}
              {activeTab === 'accepted' && (
                <div className="overflow-x-auto">
                  {previewData.sampleAccepted.length === 0 ? (
                    <p className="text-xs text-gray-500 py-4 text-center">No clean new rows to import</p>
                  ) : (
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="bg-gray-900/60 text-gray-400 uppercase text-[10px]">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2">Merchant</th>
                          <th className="px-3 py-2">Category (Inferred)</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60 font-mono">
                        {previewData.sampleAccepted.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-900/40">
                            <td className="px-3 py-2 font-sans">{new Date(row.date).toLocaleDateString('en-IN')}</td>
                            <td className="px-3 py-2 font-sans truncate max-w-xs">{row.description}</td>
                            <td className="px-3 py-2 font-sans capitalize">{row.merchant}</td>
                            <td className="px-3 py-2 font-sans">
                              <span className="inline-flex rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                                {row.category}
                              </span>
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-semibold ${
                                row.direction === 'income' ? 'text-emerald-400' : 'text-gray-200'
                              }`}
                            >
                              {row.direction === 'income' ? '+ ' : '- '}₹{row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'duplicates' && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>
                      These transactions match existing records (same date, amount, and merchant). They are excluded by default to protect your cash-flow accuracy.
                    </span>
                  </div>

                  {previewData.sampleDuplicates.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-gray-300">
                        <thead className="bg-gray-900/60 text-gray-400 uppercase text-[10px]">
                          <tr>
                            <th className="px-3 py-2">Date</th>
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2">Merchant</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 font-mono">
                          {previewData.sampleDuplicates.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-900/40 text-gray-400">
                              <td className="px-3 py-2 font-sans">{new Date(row.date).toLocaleDateString('en-IN')}</td>
                              <td className="px-3 py-2 font-sans truncate max-w-xs">{row.description}</td>
                              <td className="px-3 py-2 font-sans capitalize">{row.merchant}</td>
                              <td className="px-3 py-2 text-right">₹{row.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {previewData.counts.duplicates > 0 && (
                    <label className="flex items-center space-x-2 pt-2 cursor-pointer text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={includeDuplicates}
                        onChange={(e) => setIncludeDuplicates(e.target.checked)}
                        className="rounded border-gray-700 bg-gray-900 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      <span>Force import duplicate candidate transactions anyway</span>
                    </label>
                  )}
                </div>
              )}

              {activeTab === 'rejected' && (
                <div className="space-y-3">
                  {previewData.errors.length === 0 ? (
                    <p className="text-xs text-gray-500 py-4 text-center">No rejected rows! All rows were valid.</p>
                  ) : (
                    <div className="divide-y divide-gray-800/80 rounded-xl border border-gray-800 bg-gray-900/40 p-2">
                      {previewData.errors.map((err, idx) => (
                        <div key={idx} className="py-2.5 px-3 flex items-start space-x-3 text-xs">
                          <span className="font-mono text-rose-400 font-bold">Row {err.row}:</span>
                          <span className="text-gray-300">{err.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Confirm Import Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-gray-800 pt-4 gap-3">
                <p className="text-xs text-gray-400">
                  Ready to insert{' '}
                  <strong className="text-white">
                    {includeDuplicates
                      ? previewData.counts.accepted + previewData.counts.duplicates
                      : previewData.counts.accepted}
                  </strong>{' '}
                  records into your financial database.
                </p>

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewData(null);
                      setSelectedFile(null);
                    }}
                    className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:text-white"
                  >
                    Discard
                  </button>

                  <button
                    id="confirm-import-button"
                    type="button"
                    onClick={handleConfirm}
                    disabled={
                      isConfirming ||
                      (previewData.counts.accepted === 0 &&
                        (!includeDuplicates || previewData.counts.duplicates === 0))
                    }
                    className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isConfirming ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Confirming & Inserting...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm Import</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
