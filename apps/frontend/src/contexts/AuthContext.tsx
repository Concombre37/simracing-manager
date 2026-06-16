import { createContext, useState, useCallback, ReactNode } from 'react';
import { api } from '../services/api';

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('accessToken'),
  );

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string }>('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    setAccessToken(data.accessToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: !!accessToken,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
