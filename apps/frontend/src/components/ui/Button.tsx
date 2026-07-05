import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  isLoading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  isLoading,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold tracking-wide transition-all duration-150 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  const variants = {
    primary:
      'bg-gradient-to-b from-accent-orange to-orange-600 hover:from-orange-500 hover:to-orange-700 text-white shadow-lg shadow-accent-orange/20 focus:ring-accent-orange',
    secondary:
      'bg-dark-700/70 border border-dark-600 hover:bg-dark-600 hover:border-dark-500 text-gray-200 focus:ring-gray-500',
    danger:
      'bg-gradient-to-b from-accent-red to-red-700 hover:from-red-500 hover:to-red-800 text-white shadow-lg shadow-accent-red/20 focus:ring-accent-red',
    success:
      'bg-gradient-to-b from-green-500 to-green-700 hover:from-green-400 hover:to-green-600 text-white shadow-lg shadow-green-500/20 focus:ring-green-500',
    ghost: 'bg-transparent hover:bg-dark-700 text-gray-300 focus:ring-gray-500',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
