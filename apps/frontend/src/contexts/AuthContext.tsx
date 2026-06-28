import { createContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { api } from '../services/api';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'technician';
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isTechnician: boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('accessToken'),
  );
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async (token: string) => {
    try {
      const { data } = await api.get<User>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(data);
    } catch {
      localStorage.removeItem('accessToken');
      setAccessToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      void fetchMe(accessToken);
    } else {
      setIsLoading(false);
    }
  }, [accessToken, fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string }>('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    setAccessToken(data.accessToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        user,
        isAuthenticated: !!accessToken && !!user,
        isLoading,
        login,
        logout,
        isAdmin: user?.role === 'admin',
        isTechnician: user?.role === 'technician',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
