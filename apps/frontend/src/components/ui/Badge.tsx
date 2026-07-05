import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'gray';
}

export function Badge({ children, variant = 'gray' }: BadgeProps) {
  const variants = {
    green: 'bg-green-900/40 text-green-300 border-green-700/60',
    red: 'bg-red-900/40 text-red-300 border-red-700/60',
    yellow: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/60',
    blue: 'bg-blue-900/40 text-blue-300 border-blue-700/60',
    purple: 'bg-purple-900/40 text-purple-300 border-purple-700/60',
    gray: 'bg-dark-700 text-gray-300 border-dark-600',
  };

  const dots = {
    green: 'bg-green-400',
    red: 'bg-red-400',
    yellow: 'bg-yellow-400',
    blue: 'bg-blue-400',
    purple: 'bg-purple-400',
    gray: 'bg-gray-500',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${variants[variant]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[variant]}`} />
      {children}
    </span>
  );
}
