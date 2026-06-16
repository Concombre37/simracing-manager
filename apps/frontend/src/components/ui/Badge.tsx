import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'gray';
}

export function Badge({ children, variant = 'gray' }: BadgeProps) {
  const variants = {
    green: 'bg-green-900/50 text-green-300 border-green-800',
    red: 'bg-red-900/50 text-red-300 border-red-800',
    yellow: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
    blue: 'bg-blue-900/50 text-blue-300 border-blue-800',
    purple: 'bg-purple-900/50 text-purple-300 border-purple-800',
    gray: 'bg-dark-700 text-gray-300 border-dark-600',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
