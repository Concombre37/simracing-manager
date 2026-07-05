import { useEffect, useState } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { PageBackground } from './PageBackground';
import {
  LayoutDashboard,
  Monitor,
  Server,
  Users,
  LogOut,
  Trophy,
  Settings,
  Image,
  Clock,
  MonitorPlay,
  Flag,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/stations', label: 'Postes', icon: Monitor },
  { path: '/dedicated-servers', label: 'Serveurs', icon: Server },
  { path: '/leaderboard', label: 'Classement', icon: Trophy },
  { path: '/en-cours', label: 'En cours', icon: Clock },
];

const adminNavItems = [
  { path: '/users', label: 'Utilisateurs', icon: Users },
  { path: '/content-previews', label: 'Images', icon: Image },
  { path: '/blanking-media', label: 'Écrans', icon: MonitorPlay },
  { path: '/settings', label: 'Paramètres', icon: Settings },
];

const BREADCRUMBS: Record<string, string[]> = {
  '/': ['Dashboard'],
  '/stations': ['Postes'],
  '/dedicated-servers': ['Serveurs'],
  '/dedicated-servers/create': ['Serveurs', 'Nouveau serveur'],
  '/leaderboard': ['Classement'],
  '/en-cours': ['Sessions en cours'],
  '/users': ['Utilisateurs'],
  '/content-previews': ['Images'],
  '/blanking-media': ['Écrans'],
  '/settings': ['Paramètres'],
};

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout, user, isAdmin } = useAuth();
  const location = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const crumbs = BREADCRUMBS[location.pathname] ?? ['Manager'];
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <div className="relative min-h-screen">
      <PageBackground />

      {/* Rail de navigation : icônes seules, labels révélés au survol */}
      <aside className="group/rail fixed inset-y-0 left-0 z-40 flex w-[72px] flex-col overflow-hidden border-r border-dark-700 bg-dark-900/95 backdrop-blur-md transition-[width] duration-200 ease-out hover:w-60">
        <Link
          to="/"
          className="flex h-14 shrink-0 items-center gap-3 border-b border-dark-700 px-[18px]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-orange to-accent-red shadow-glow-orange">
            <Flag className="h-[18px] w-[18px] text-white" />
          </div>
          <div className="whitespace-nowrap leading-tight opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100">
            <p className="text-base font-black tracking-tight">
              <span className="text-accent-orange">SIM</span>
              <span className="text-white">RACING</span>
            </p>
            <p className="text-[9px] font-semibold tracking-[0.2em] text-gray-500">MANAGER</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-3">
          {navItems.map((item) => (
            <RailLink key={item.path} item={item} active={location.pathname === item.path} />
          ))}

          {isAdmin && (
            <>
              <div className="my-3 border-t border-dark-700" />
              {adminNavItems.map((item) => (
                <RailLink key={item.path} item={item} active={location.pathname === item.path} />
              ))}
            </>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-3 border-t border-dark-700 p-3 pl-[18px]">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dark-600 bg-dark-700 text-xs font-bold text-accent-orange"
            title={user.email}
          >
            {initials}
          </div>
          <div className="min-w-0 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100">
            <p className="truncate text-xs font-medium text-white">{user.email}</p>
            <p className="text-[10px] capitalize text-gray-500">{user.role}</p>
          </div>
        </div>
      </aside>

      {/* Colonne de contenu */}
      <div className="flex min-h-screen flex-col pl-[72px]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-dark-700 bg-dark-950/70 px-6 backdrop-blur-md">
          <nav className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">SimRacing</span>
            {crumbs.map((crumb, i) => (
              <span key={crumb} className="flex items-center gap-2">
                <span className="text-gray-600">/</span>
                <span
                  className={
                    i === crumbs.length - 1
                      ? 'font-semibold tracking-tight text-white'
                      : 'text-gray-400'
                  }
                >
                  {crumb}
                </span>
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 font-mono text-xs tabular-nums text-gray-500 sm:flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ring-pulse rounded-full bg-accent-orange" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-orange" />
              </span>
              {now.toLocaleTimeString('fr-FR')}
            </div>
            <div className="hidden h-6 w-px bg-dark-700 sm:block" />
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dark-600 bg-dark-800 text-[11px] font-bold text-accent-orange">
                {initials}
              </div>
              <div className="hidden leading-tight md:block">
                <p className="text-xs font-medium text-white">{user.email}</p>
                <p className="text-[10px] capitalize text-gray-500">{user.role}</p>
              </div>
              <button
                onClick={logout}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-red-900/20 hover:text-accent-red active:scale-90"
                title="Déconnexion"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1400px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function RailLink({
  item,
  active,
}: {
  item: { path: string; label: string; icon: React.ElementType };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      title={item.label}
      className="relative flex items-center gap-3 rounded-lg px-[13px] py-2.5 transition-colors"
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          className="absolute inset-0 rounded-lg bg-accent-orange/15"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent-orange shadow-glow-orange" />
      )}
      <Icon
        className={`relative h-5 w-5 shrink-0 transition-colors ${
          active ? 'text-accent-orange' : 'text-gray-400'
        }`}
      />
      <span
        className={`relative whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 ${
          active ? 'text-white' : 'text-gray-400'
        }`}
      >
        {item.label}
      </span>
    </Link>
  );
}
