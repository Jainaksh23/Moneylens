import React from 'react';
import { ShieldAlert, BookOpen } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-gray-800 bg-[#080c13] py-4 px-6 text-xs text-gray-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-gray-400">
          <ShieldAlert className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span>
            <strong className="text-gray-300">Mandatory Disclaimer:</strong> MoneyLens is an academic AI/ML project designed for educational decision support. It is not registered with SEBI or RBI, and does not provide certified financial, investment, or tax advisory services.
          </span>
        </div>
        <div className="flex items-center space-x-4 text-gray-400">
          <span className="flex items-center space-x-1">
            <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
            <span>Grounded Knowledge Base</span>
          </span>
          <span>© {new Date().getFullYear()} MoneyLens</span>
        </div>
      </div>
    </footer>
  );
};
