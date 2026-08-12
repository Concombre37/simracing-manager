import { useEffect, useState } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useSiteLogo } from '../services/stations';
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
  History,
  MonitorPlay,
  Flag,
  Tv,
  Tag,
  Tags,
  UtensilsCrossed,
  Tablet,
} from 'lucide-react';

// L'essentiel du quotidien : toujours en pleine évidence, jamais replié.
const primaryNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/stations', label: 'Postes', icon: Monitor },
  { path: '/dedicated-servers', label: 'Serveurs', icon: Server },
];

// Consulté occasionnellement — toujours à un clic, juste visuellement plus
// discret pour ne pas concurrencer l'essentiel ci-dessus.
const secondaryNavItems = [
  { path: '/leaderboard', label: 'Classement', icon: Trophy },
  { path: '/en-cours', label: 'En cours', icon: Clock },
  { path: '/sessions/history', label: 'Historique', icon: History },
];

const adminNavItems = [
  { path: '/users', label: 'Utilisateurs', icon: Users },
  { path: '/content-previews', label: 'Images', icon: Image },
  { path: '/content-names', label: 'Noms', icon: Tag },
  { path: '/content-categories', label: 'Catégories', icon: Tags },
  { path: '/race-formats', label: 'Formats de course', icon: Flag },
  { path: '/restaurant-menu', label: 'Carte resto/bar', icon: UtensilsCrossed },
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
  '/sessions/history': ['Historique'],
  '/users': ['Utilisateurs'],
  '/content-previews': ['Images'],
  '/content-names': ['Noms'],
  '/content-categories': ['Catégories'],
  '/race-formats': ['Formats de course'],
  '/restaurant-menu': ['Carte resto/bar'],
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

  const logo = useSiteLogo(!!user);

  useEffect(() => {
    if (!logo) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = logo.downloadUrl;
  }, [logo]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const crumbs =
    BREADCRUMBS[location.pathname] ??
    (/^\/dedicated-servers\/.+\/join$/.test(location.pathname)
      ? ['Serveurs', 'Envoyer les POD']
      : /^\/sessions\/[^/]+$/.test(location.pathname)
        ? ['Historique', 'Détail session']
        : ['Manager']);
  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <div className="relative min-h-screen">
      <PageBackground />

      {/* Rail de navigation : icônes seules, labels révélés au survol */}
      <aside className="group/rail fixed inset-y-0 left-0 z-40 flex w-[72px] flex-col overflow-hidden border-r border-dark-700 bg-dark-900/95 backdrop-blur-md transition-[width] duration-200 ease-out hover:w-60">
        <Link
          to="/"
          className="flex h-14 shrink-0 items-center gap-3 border-b border-dark-700 px-[14px]"
        >
          {logo ? (
            // Le fichier uploadé est le wordmark complet ("ELSASS SIMRACING
            // HAGUENAU") utilisé aussi comme fond d'écran de fin de session —
            // on ne peut pas le recadrer à la source sans casser cet autre
            // usage. Crop CSS (position/dimensions calculées sur le logo
            // actuel) : n'affiche que le pictogramme "ES", assez compact
            // pour tenir sans être rogné dans le rail replié (72px) comme
            // dans le rail déplié au survol.
            <div className="relative h-[22px] w-14 shrink-0 overflow-hidden rounded-md bg-dark-800/80 ring-1 ring-white/10">
              <img
                src={logo.downloadUrl}
                alt="Logo"
                className="absolute max-w-none"
                style={{ width: 141, height: 69, left: -44, top: -14 }}
              />
            </div>
          ) : (
            <>
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
            </>
          )}
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-3">
          {primaryNavItems.map((item) => (
            <RailLink key={item.path} item={item} active={location.pathname === item.path} />
          ))}

          <div className="my-3 border-t border-dark-700" />
          <RailSectionLabel>Suivi</RailSectionLabel>
          {secondaryNavItems.map((item) => (
            <RailLink key={item.path} item={item} active={location.pathname === item.path} muted />
          ))}

          {isAdmin && (
            <>
              <div className="my-3 border-t border-dark-700" />
              <RailSectionLabel>Administration</RailSectionLabel>
              {adminNavItems.map((item) => (
                <RailLink
                  key={item.path}
                  item={item}
                  active={location.pathname === item.path}
                  muted
                />
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
            <Link
              to="/kiosk"
              className="flex items-center gap-2 rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-3 py-1.5 text-xs font-bold text-accent-orange transition-colors hover:bg-accent-orange/20"
            >
              <Tv className="h-3.5 w-3.5" />
              Mode kiosque
            </Link>
            {/* Simple raccourci de prévisualisation pour le staff — pas le
                point d'accès principal (les tablettes clients ont l'URL en
                favori), donc target="_blank" est acceptable ici contrairement
                au lien "Mode kiosque" ci-dessus. */}
            <a
              href="/tablet-menu"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-dark-600 px-3 py-1.5 text-xs font-bold text-gray-300 transition-colors hover:border-accent-orange/40 hover:text-accent-orange"
            >
              <Tablet className="h-3.5 w-3.5" />
              Menu tablette
            </a>
            <div className="hidden h-6 w-px bg-dark-700 sm:block" />
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

// Label de section discret : n'apparaît qu'au survol du rail (même pattern
// que le texte des liens), pour ne rien ajouter au rail replié.
function RailSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-[13px] pb-1 pt-1.5 opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100">
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-gray-600">
        {children}
      </span>
    </div>
  );
}

function RailLink({
  item,
  active,
  muted,
}: {
  item: { path: string; label: string; icon: React.ElementType };
  active: boolean;
  /** Item consulté occasionnellement (suivi/administration) — plus discret
   * au repos, mais identique une fois actif : rien n'est réellement caché,
   * juste moins de poids visuel face à l'essentiel du quotidien. */
  muted?: boolean;
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
          active ? 'text-accent-orange' : muted ? 'text-gray-600' : 'text-gray-400'
        }`}
      />
      <span
        className={`relative whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 ${
          active ? 'text-white' : muted ? 'text-gray-500' : 'text-gray-400'
        }`}
      >
        {item.label}
      </span>
    </Link>
  );
}
