import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthToken, ApiError } from '../api';

const TOKEN_KEY = 'lion_barber_token';

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  points: number;
  role: 'client' | 'admin' | 'staff';
  phone?: string;
  /** Cuenta de barbero (staff): id en la agenda */
  barberId?: string | null;
}

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  /** Admin o empleado: puede entrar al panel /dashboard */
  canAccessDashboard: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  loginWithGoogle: async () => {},
  logout: async () => {},
  isAdmin: false,
  canAccessDashboard: false,
});

export const useAuth = () => useContext(AuthContext);

function profileFromBackend(u: {
  id: number;
  email: string;
  name: string;
  role: string;
  points?: number;
  barberId?: string | null;
}): UserProfile {
  const role =
    u.role === 'admin' ? 'admin' : u.role === 'staff' ? 'staff' : 'client';
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    points: u.points ?? 0,
    role,
    barberId: u.barberId ?? null,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loginWithGoogle = async (idToken: string) => {
    const { token, user } = await api.auth.postGoogle(idToken);
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setProfile(profileFromBackend(user));
  };

  const logout = async () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    setProfile(null);
  };

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    let cancelled = false;
    (async () => {
      try {
        const user = await api.auth.getMe();
        if (!cancelled) setProfile(profileFromBackend(user));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setAuthToken(null);
          if (!cancelled) setProfile(null);
          return;
        }
        try {
          await new Promise((r) => setTimeout(r, 700));
          const user = await api.auth.getMe();
          if (!cancelled) setProfile(profileFromBackend(user));
        } catch (err2) {
          if (err2 instanceof ApiError && err2.status === 401) {
            localStorage.removeItem(TOKEN_KEY);
            setAuthToken(null);
            if (!cancelled) setProfile(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = profile?.role === 'admin';
  const canAccessDashboard = profile?.role === 'admin' || profile?.role === 'staff';

  return (
    <AuthContext.Provider
      value={{
        user: profile,
        profile,
        loading,
        loginWithGoogle,
        logout,
        isAdmin,
        canAccessDashboard,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
