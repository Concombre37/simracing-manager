import { Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LayoutDashboard,
  Monitor,
  Server,
  Users,
  LogOut,
  Trophy,
  Settings,
  Image,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/stations', label: 'Postes', icon: Monitor },
  { path: '/dedicated-servers', label: 'Serveurs', icon: Server },
  { path: '/leaderboard', label: 'Classement', icon: Trophy },
];

const adminNavItems = [
  { path: '/users', label: 'Utilisateurs', icon: Users },
  { path: '/content-previews', label: 'Images', icon: Image },
  { path: '/settings', label: 'Paramètres', icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { logout, user, isAdmin } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <nav className="h-16 bg-dark-800 border-b border-dark-600 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight">
              <span className="text-accent-orange">SIM</span>
              <span className="text-white">RACING</span>
            </span>
            <span className="text-xs text-gray-500 font-medium ml-2">MANAGER</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink key={item.path} item={item} active={location.pathname === item.path} />
            ))}
            {isAdmin && (
              <div className="flex items-center gap-1 ml-4 pl-4 border-l border-dark-600">
                {adminNavItems.map((item) => (
                  <NavLink key={item.path} item={item} active={location.pathname === item.path} />
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-white">{user.email}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

function NavLink({
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
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-accent-orange/10 text-accent-orange'
          : 'text-gray-400 hover:text-white hover:bg-dark-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {item.label}
    </Link>
  );
}
