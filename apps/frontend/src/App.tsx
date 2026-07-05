import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Stations } from './pages/Stations';
import { DedicatedServers } from './pages/DedicatedServers';
import { CreateDedicatedServer } from './pages/CreateDedicatedServer';
import { Users } from './pages/Users';
import { Leaderboard } from './pages/Leaderboard';
import { Sessions } from './pages/Sessions';
import { ContentPreviews } from './pages/ContentPreviews';
import { BlankingMedia } from './pages/BlankingMedia';
import { Settings } from './pages/Settings';

const queryClient = new QueryClient();

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

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
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
