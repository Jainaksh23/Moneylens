import React from 'react';
import { FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <FileQuestion className="h-8 w-8 text-gray-500" />,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      role="region"
      aria-label={title}
      className={`rounded-2xl border border-gray-800 bg-[#0e131d]/90 p-8 sm:p-12 text-center shadow-xl space-y-4 max-w-xl mx-auto my-6 ${className}`}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/60 border border-gray-700/50">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
        <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">{description}</p>
      </div>
      {action && <div className="pt-2 flex justify-center items-center gap-3">{action}</div>}
    </div>
  );
};
