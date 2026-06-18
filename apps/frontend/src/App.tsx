import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Stations } from './pages/Stations';
import { DedicatedServers } from './pages/DedicatedServers';
import { Users } from './pages/Users';
import { Leaderboard } from './pages/Leaderboard';
import { Telemetry } from './pages/Telemetry';
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
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
              path="/leaderboard"
              element={
                <ProtectedRoute>
                  <Leaderboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/telemetry"
              element={
                <ProtectedRoute>
                  <Telemetry />
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
