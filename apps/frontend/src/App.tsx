import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';

// Chargées à la demande (React.lazy) plutôt qu'en statique : /tablet-menu
// est une route publique sans connexion consultée depuis des tablettes
// clients, et n'a strictement rien à faire avec le dashboard admin — sans
// ce découpage, son bundle initial embarquait tout le code de chaque page
// admin (Lighthouse mobile : ~148 Ko de JS inutilisé, gros contributeur au
// Total Blocking Time). Chaque page devient son propre chunk Vite.
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Stations = lazy(() => import('./pages/Stations').then((m) => ({ default: m.Stations })));
const DedicatedServers = lazy(() =>
  import('./pages/DedicatedServers').then((m) => ({ default: m.DedicatedServers })),
);
const CreateDedicatedServer = lazy(() =>
  import('./pages/CreateDedicatedServer').then((m) => ({ default: m.CreateDedicatedServer })),
);
const JoinServer = lazy(() =>
  import('./pages/JoinServer').then((m) => ({ default: m.JoinServer })),
);
const Users = lazy(() => import('./pages/Users').then((m) => ({ default: m.Users })));
const Leaderboard = lazy(() =>
  import('./pages/Leaderboard').then((m) => ({ default: m.Leaderboard })),
);
const Sessions = lazy(() => import('./pages/Sessions').then((m) => ({ default: m.Sessions })));
const SessionHistory = lazy(() =>
  import('./pages/SessionHistory').then((m) => ({ default: m.SessionHistory })),
);
const SessionDetail = lazy(() =>
  import('./pages/SessionDetail').then((m) => ({ default: m.SessionDetail })),
);
const SessionsKiosk = lazy(() =>
  import('./pages/SessionsKiosk').then((m) => ({ default: m.SessionsKiosk })),
);
const Kiosk = lazy(() => import('./pages/Kiosk').then((m) => ({ default: m.Kiosk })));
const ContentPreviews = lazy(() =>
  import('./pages/ContentPreviews').then((m) => ({ default: m.ContentPreviews })),
);
const ContentNames = lazy(() =>
  import('./pages/ContentNames').then((m) => ({ default: m.ContentNames })),
);
const ContentCategories = lazy(() =>
  import('./pages/ContentCategories').then((m) => ({ default: m.ContentCategories })),
);
const RaceFormats = lazy(() =>
  import('./pages/RaceFormats').then((m) => ({ default: m.RaceFormats })),
);
const Menu = lazy(() => import('./pages/Menu').then((m) => ({ default: m.Menu })));
const Arcade = lazy(() => import('./pages/Arcade').then((m) => ({ default: m.Arcade })));
const TabletMenu = lazy(() =>
  import('./pages/TabletMenu').then((m) => ({ default: m.TabletMenu })),
);
const BlankingMedia = lazy(() =>
  import('./pages/BlankingMedia').then((m) => ({ default: m.BlankingMedia })),
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900">
      <p className="text-gray-500">Chargement...</p>
    </div>
  );
}

function ProtectedRoute({ children, adminOnly }: { children: JSX.Element; adminOnly?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
}

/** Same auth gate as ProtectedRoute but skips the sidebar `Layout` — meant
 * to be pointed at a TV/wall monitor, where the nav chrome would only eat
 * into the screen real estate a 10-POD grid needs. */
function KioskRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stations"
            element={
              <ProtectedRoute>
                <Stations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dedicated-servers"
            element={
              <ProtectedRoute>
                <DedicatedServers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dedicated-servers/create"
            element={
              <ProtectedRoute>
                <CreateDedicatedServer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dedicated-servers/:id/join"
            element={
              <ProtectedRoute>
                <JoinServer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/en-cours"
            element={
              <ProtectedRoute>
                <Sessions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sessions/history"
            element={
              <ProtectedRoute>
                <SessionHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sessions/:id"
            element={
              <ProtectedRoute>
                <SessionDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/en-cours/kiosk"
            element={
              <KioskRoute>
                <SessionsKiosk />
              </KioskRoute>
            }
          />
          <Route
            path="/kiosk"
            element={
              <KioskRoute>
                <Kiosk />
              </KioskRoute>
            }
          />
          <Route
            path="/kiosk/dedicated-servers/create"
            element={
              <KioskRoute>
                <CreateDedicatedServer />
              </KioskRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute adminOnly>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/content-previews"
            element={
              <ProtectedRoute adminOnly>
                <ContentPreviews />
              </ProtectedRoute>
            }
          />
          <Route
            path="/content-names"
            element={
              <ProtectedRoute adminOnly>
                <ContentNames />
              </ProtectedRoute>
            }
          />
          <Route
            path="/content-categories"
            element={
              <ProtectedRoute adminOnly>
                <ContentCategories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/race-formats"
            element={
              <ProtectedRoute adminOnly>
                <RaceFormats />
              </ProtectedRoute>
            }
          />
          <Route
            path="/restaurant-menu"
            element={
              <ProtectedRoute adminOnly>
                <Menu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arcade"
            element={
              <ProtectedRoute adminOnly>
                <Arcade />
              </ProtectedRoute>
            }
          />
          {/* Publique, sans connexion — destinée aux tablettes clients, pas au
            staff. Ni ProtectedRoute (pas de compte requis) ni Layout (pas
            de chrome admin) — plein écran, comme le prototype importé. */}
          <Route path="/tablet-menu" element={<TabletMenu />} />
          <Route
            path="/blanking-media"
            element={
              <ProtectedRoute adminOnly>
                <BlankingMedia />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute adminOnly>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
