import type { ReactNode } from 'react';
import { PageTransition } from '../PageTransition';

interface PageShellProps {
  title: string;
  accent?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Squelette commun à toutes les pages : rangée titre/actions normalisée
 * puis contenu espacé de façon constante. Garantit la cohérence visuelle.
 */
export function PageShell({ title, accent, subtitle, actions, children }: PageShellProps) {
  return (
    <PageTransition>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-dark-700 pb-5">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              {title}
              {accent ? <span className="text-accent-orange"> {accent}</span> : null}
            </h1>
            {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </header>
        {children}
      </div>
    </PageTransition>
  );
}
