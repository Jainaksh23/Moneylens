import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  variant?: 'text' | 'rect' | 'circle' | 'card' | 'table-row';
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  count = 1,
  ...props
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case 'text':
        return 'h-4 w-full rounded';
      case 'circle':
        return 'h-10 w-10 rounded-full';
      case 'card':
        return 'h-32 w-full rounded-2xl';
      case 'table-row':
        return 'h-12 w-full rounded-xl';
      case 'rect':
      default:
        return 'h-6 w-full rounded-lg';
    }
  };

  const elements = Array.from({ length: count });

  return (
    <div
      role="status"
      aria-label="Loading..."
      className="space-y-3 w-full"
    >
      {elements.map((_, index) => (
        <div
          key={index}
          className={`animate-pulse bg-gray-800/60 border border-gray-800/40 ${getVariantClass()} ${className}`}
          aria-hidden="true"
          {...props}
        />
      ))}
      <span className="sr-only">Loading content, please wait...</span>
    </div>
  );
};
