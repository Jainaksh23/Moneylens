import React from 'react';
import { UploadCloud, Plus, FileSpreadsheet } from 'lucide-react';

export const TransactionsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Transactions Management</h1>
          <p className="text-sm text-gray-400 mt-1">
            Import Indian bank statement CSVs or log manual transactions with auto-categorization.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="inline-flex items-center space-x-2 rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors">
            <UploadCloud className="h-4 w-4" />
            <span>Import CSV</span>
          </button>
          <button className="inline-flex items-center space-x-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
            <Plus className="h-4 w-4" />
            <span>Add Transaction</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-gray-800 bg-[#0e131d]/40 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800/80 text-gray-400">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-200">No Transactions Ingested Yet</h3>
        <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
          Transaction ingestion, validation schemas, and auto-categorization ML models will be wired up in upcoming phases.
        </p>
      </div>
    </div>
  );
};
