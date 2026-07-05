import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-orange focus:border-transparent ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-accent-orange ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full bg-dark-900 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-orange focus:border-transparent ${className}`}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
  className = '',
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 ${className}`}
    >
      {children}
    </label>
  );
}
