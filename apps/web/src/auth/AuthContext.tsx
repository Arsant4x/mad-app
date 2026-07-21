import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient, refreshSession, setAccessToken, setUnauthorizedHandler, type AuthUser } from '../api/client';

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  bootLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
    // Access tokens live in memory only, so on a fresh page load we try to
    // mint one from the httpOnly refresh cookie before deciding whether the
    // user is actually logged out. Goes through the shared, deduped
    // refreshSession() (not a raw apiClient call) because React 18
    // StrictMode double-invokes this effect in dev, and the refresh token
    // is single-use — two concurrent calls would race.
    refreshSession()
      .then((result) => {
        if (result) {
          setAccessToken(result.accessToken);
          setUser(result.user);
        } else {
          setAccessToken(null);
          setUser(null);
        }
      })
      .finally(() => setBootLoading(false));

    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      bootLoading,
      async login(username: string, password: string) {
        const res = await apiClient.post<LoginResponse>('/auth/login', { username, password });
        setAccessToken(res.data.accessToken);
        setUser(res.data.user);
      },
      async logout() {
        await apiClient.post('/auth/logout').catch(() => undefined);
        setAccessToken(null);
        setUser(null);
      },
    }),
    [user, bootLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
